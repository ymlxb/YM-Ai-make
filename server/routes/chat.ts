import express, { Request, Response } from "express";
import { buildAgent } from "../agents/graphs/main.graph.js";
import { resolveRouteAdapter } from "../agents/adapters/routeRegistry.js";
import {
  DEFAULT_MOCK_PRESET,
  resolveMockConfig,
  MockConfig,
} from "../config/mock.js";
import { NODE_HANDLERS } from "../config/chat.js";
import { generateChatAnswer } from "../services/chat/answer.js";
import {
  registerRun,
  stopRun,
  unregisterRun,
  isRunStopped,
} from "../services/chat/cancelRegistry.js";
import {
  saveProjectFiles,
  loadProjectFiles,
  getBaseProjectId,
} from "../services/project/store.js";

const router = express.Router();

// 预构建三种 Agent（编译一次，复用多次）
const traditionalAgent = buildAgent("traditional");
const figmaAgent = buildAgent("figma");
const modificationAgent = buildAgent("modification");

/**
 * 停止正在运行的生成任务
 * 前端“停止生成”按钮会先调用本接口，再中断本地 SSE。
 */
router.post("/stop", (req: Request, res: Response) => {
  const { threadId } = req.body || {};
  if (!threadId || typeof threadId !== "string") {
    return res.status(400).json({ ok: false, error: "missing threadId" });
  }
  const stopped = stopRun(threadId);
  console.log(
    `[Chat] Stop request for ${threadId}: ${stopped ? "aborted" : "not running"}`,
  );
  res.json({ ok: true, stopped });
});

router.post("/", async (req: Request, res: Response) => {
  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform"); // no-transform 防止压缩
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // 禁用 Nginx 等代理缓冲

  // 立即发送头部
  res.flushHeaders();

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let threadId = "";
  let baseProjectId = "";
  let signal: AbortSignal | undefined;
  let finished = false;

  try {
    const {
      messages,
      mockConfig: userMockConfig,
      projectId,
      files,
    } = req.body;
    console.log("Received messages count:", messages?.length);
    if (files) {
      console.log("Received current files count:", Object.keys(files).length);
    }

    // 解析 Mock 配置
    const mockConfigInput: MockConfig = userMockConfig || DEFAULT_MOCK_PRESET;
    const mockConfig = resolveMockConfig(mockConfigInput);

    // 使用 projectId 作为 thread_id 实现项目隔离
    threadId =
      projectId ||
      `project-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    baseProjectId = getBaseProjectId(threadId);

    console.log("Using thread_id (projectId):", threadId);

    // ========== 运行注册 + 中断支持 ==========
    const controller = registerRun(threadId);
    signal = controller.signal;

    // 客户端提前断开（刷新/关闭页面/主动取消）时，中断服务端运行
    res.on("close", () => {
      if (!finished && !signal?.aborted) {
        console.log(`[Chat] Client disconnected, aborting run: ${threadId}`);
        controller.abort();
      }
    });

    // ========== 服务端记忆：加载项目当前文件 ==========
    // 优先使用前端携带的 files；没有则从项目存储按 projectId 加载
    const resolvedFiles =
      files ?? (await loadProjectFiles(baseProjectId)) ?? undefined;
    if (resolvedFiles && !files) {
      console.log(
        `[Chat] Loaded files from project store: ${Object.keys(resolvedFiles).length}`,
      );
    }

    // ========== 路由适配层：统一分流输入 ==========
    const routeResult = await resolveRouteAdapter({
      messages,
      mockConfig,
      files: resolvedFiles,
    });
    const { flow } = routeResult;

    if (flow === "figma") {
      console.log(`🎨 [Route] 使用 Figma 直连流程`);
      if (routeResult.meta?.figmaUrl) {
        console.log(`   URL: ${routeResult.meta.figmaUrl}`);
      }
    } else if (flow === "modification") {
      console.log(`✏️  [Route] 使用修改请求流程`);
      console.log(
        `   待修改文件数: ${routeResult.meta?.fileCount ?? "unknown"}`,
      );
    } else {
      console.log(`📝 [Route] 使用 Traditional 流程`);
      console.log("Using mockConfig:", JSON.stringify(mockConfig));
    }

    // 发送初始为了建立连接的注释包（某些浏览器/代理需要先收到数据才认为连接成功）
    res.write(": keep-alive\n\n");
    heartbeat = setInterval(() => {
      res.write(": keep-alive\n\n");
      if ((res as any).flush) {
        (res as any).flush();
      }
    }, 10000);

    const config = {
      configurable: { thread_id: threadId },
      streamMode: "updates" as const,
      signal,
    };

    // ========== 选择 Agent 并构造输入 ==========
    const agent =
      flow === "figma"
        ? figmaAgent
        : flow === "modification"
          ? modificationAgent
          : traditionalAgent;
    const input = routeResult.input;

    // 使用 stream 而不是 invoke
    // streamMode: "updates" 会返回并通过 yield 输出每个节点的更新
    const stream = await agent.stream(input, config);

    for await (const chunk of stream) {
      // 每处理一个节点前检查是否被中断
      if (signal?.aborted || isRunStopped(threadId)) {
        console.log(`[Chat] Run aborted, stopping stream: ${threadId}`);
        break;
      }

      console.log("Chunk received keys:", Object.keys(chunk));

      // LangGraph 的 stream 块通常是 { [nodeName]: nodeOutput }
      const nodeName = Object.keys(chunk)[0];
      const output = (chunk as any)[nodeName];

      if (!output) {
        console.log("Empty output for node:", nodeName);
        continue;
      }

      console.log("Processing node:", nodeName);
      console.log("\n");

      // 使用策略表处理节点输出
      const handler = NODE_HANDLERS[nodeName];

      if (!handler) {
        console.log(`Unknown node update: ${nodeName}`);
        continue;
      }

      const eventType = handler.type;
      let payload = output[handler.key];

      if (payload === undefined) {
        payload = (output as any)[eventType];
      }

      if (payload === undefined) {
        console.warn(
          `Skipping ${nodeName}: missing output key "${handler.key}"`,
        );
        continue;
      }

      if (nodeName === "analysisNode" && output.skipGeneration === true) {
        payload = {
          ...payload,
          skipGeneration: true,
        };
      }

      // 构造 SSE 消息
      // 格式: data: {JSON}\n\n
      const sseMessage = JSON.stringify({
        type: eventType,
        data: payload,
      });
      res.write(`data: ${sseMessage}\n\n`);

      // ========== 服务端记忆：生成/修改完成后保存文件集 ==========
      if (
        (eventType === "files" ||
          eventType === "figmaAssembly" ||
          eventType === "modificationFiles") &&
        payload?.files &&
        typeof payload.files === "object"
      ) {
        await saveProjectFiles(baseProjectId, payload.files);
      }

      // 立即刷新缓冲区 (如果环境支持 flush)
      if ((res as any).flush) {
        (res as any).flush();
      }

      if (nodeName === "analysisNode" && output.skipGeneration === true) {
        const answer = await generateChatAnswer({
          messages,
          analysis: output.analysis,
        });
        res.write(
          `data: ${JSON.stringify({
            type: "answer",
            data: { content: answer },
          })}\n\n`,
        );
        if ((res as any).flush) {
          (res as any).flush();
        }
      }
    }

    // 发送结束信号（被中断则发送 stopped）
    const wasStopped = signal?.aborted || isRunStopped(threadId);
    if (!res.destroyed && !res.writableEnded) {
      res.write(
        `data: ${JSON.stringify(
          wasStopped ? { type: "stopped" } : { type: "done" },
        )}\n\n`,
      );
    }
    if (heartbeat) clearInterval(heartbeat);
    res.end();
  } catch (error) {
    const wasStopped = signal?.aborted || isRunStopped(threadId);
    if (wasStopped) {
      console.log(`[Chat] Run aborted, sending stopped: ${threadId}`);
    } else {
      console.error("Error processing chat:", error);
    }
    // 被中断发送 stopped，否则发送错误信号
    if (!res.destroyed && !res.writableEnded) {
      res.write(
        `data: ${JSON.stringify(
          wasStopped
            ? { type: "stopped" }
            : {
                type: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Internal server error",
              },
        )}\n\n`,
      );
    }
    if (heartbeat) clearInterval(heartbeat);
    res.end();
  } finally {
    finished = true;
    if (threadId) unregisterRun(threadId);
  }
});

export default router;

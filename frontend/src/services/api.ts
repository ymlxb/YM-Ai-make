// API 请求封装
import { ChatMessage } from "@/types/message";
import { StreamEvent } from "@/types/api";
import { API_BASE_URL } from "@/constants/config";

export async function getReactTS_Template(): Promise<
  Record<string, { code: string }>
> {
  const response = await fetch("/api/template/react-ts");
  if (!response.ok) {
    throw new Error("Failed to fetch template");
  }
  return response.json();
}

/**
 * generateApp (Stream)
 *
 * 调用后端 /api/chat 接口 (SSE模式)
 * 职责：
 * - 发送对话上下文和项目 ID
 * - 处理 SSE 流式响应，回调 onChunk 更新状态
 */
export async function generateAppStream(
  params: {
    messages: ChatMessage[];
    projectId?: string;
    /** 当前项目已有代码（Sandpack 格式），修改请求流程需要携带 */
    files?: Record<string, string>;
  },
  onChunk: (event: StreamEvent) => void,
  /** 传入 AbortSignal 支持用户手动停止生成 */
  signal?: AbortSignal,
): Promise<void> {
  try {
    // 临时直接连接后端，绕过 Next.js 代理以测试 SSE 问题
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        messages: params.messages,
        projectId: params.projectId, // 传递项目 ID
        files: params.files, // 修改请求：携带当前代码文件
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码当前块
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // 处理 buffer 中的完整行 (SSE 以 \n\n 分隔)
      const lines = buffer.split("\n\n");
      // 保留最后一个可能不完整的部分存回 buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);
            console.log("[Stream] Parsed event:", event.type);
            onChunk(event);
          } catch (e) {
            console.warn("Failed to parse SSE message:", jsonStr, e);
          }
        }
      }
    }
  } catch (error) {
    // 用户主动停止：不是错误，推送 stopped 事件
    if (error instanceof Error && error.name === "AbortError") {
      console.log("[Stream] Aborted by user");
      onChunk({
        type: "stopped",
        data: { message: "已停止生成" },
      });
      return;
    }
    console.error("Stream error:", error);
    onChunk({
      type: "error",
      data: {
        message: error instanceof Error ? error.message : "Network error",
      },
    });
  }
}

/**
 * 通知后端停止指定项目的生成任务
 * 先停服务端运行（避免继续消耗 LLM token），再中断本地 SSE。
 */
export async function stopChatStream(projectId: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/chat/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ threadId: projectId }),
    });
  } catch (error) {
    console.warn("Stop request failed:", error);
  }
}

/**
 * generateApp (Legacy) - 已废弃，提醒迁移
 */
export async function generateApp(): Promise<{ message: string }> {
  throw new Error("generateApp is deprecated. Use generateAppStream instead.");
}

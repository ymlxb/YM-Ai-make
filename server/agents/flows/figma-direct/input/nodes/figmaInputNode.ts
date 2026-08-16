/**
 * Figma 直连流程 - 输入节点（REST API 版）
 *
 * 职责：
 * 1. 接收 Figma URL（figma.com/design|file/...）
 * 2. 使用 Figma 官方 REST API（免费个人访问令牌）拉取设计结构
 * 3. 渲染图片节点并通过 LLM 将设计结构转换为单文件 TSX
 * 4. 返回原始代码字符串，供后续节点解析和拆分
 *
 * 不再依赖 Figma Desktop 内置 MCP（付费 Dev Mode 能力）。
 *
 * 流程位置: Step 1 / 4
 * 上游: START (接收 figmaUrl)
 * 下游: imageDownloadNode (图片 OSS 化) → astParserNode (解析代码结构)
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import {
  buildCompactDesign,
  collectImageNodeIds,
  getFigmaRestClient,
  parseFigmaUrl,
  summarizeVariables,
} from "../../../../../services/figma/restClient.js";
import { buildFigmaCodegenMessages } from "../prompts/figmaCodegenPrompts.js";
import { getMainModel } from "../../../../utils/model.js";

/** 从消息列表提取最近一条用户文本，作为代码生成的补充说明 */
function getLastUserText(messages: any[]): string {
  const lastUser = [...(messages || [])]
    .reverse()
    .find((m) => m?.role === "user");
  if (typeof lastUser?.content === "string") return lastUser.content;
  if (Array.isArray(lastUser?.content)) {
    return lastUser.content
      .map((c: any) => c.text || "")
      .join(" ")
      .trim();
  }
  return "";
}

/** 提取 LLM 响应的文本内容（兼容 string / content array） */
function extractTextContent(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) =>
        typeof part === "string"
          ? part
          : typeof part?.text === "string"
            ? part.text
            : "",
      )
      .join("")
      .trim();
  }
  return String(content ?? "");
}

/** 去掉 markdown 代码块包裹 */
function stripCodeFence(code: string): string {
  const result = code.trim();
  const fence = result.match(
    /^```(?:tsx|typescript|jsx|ts)?\s*([\s\S]*?)```\s*$/i,
  );
  if (fence) return fence[1].trim();
  return result;
}

/** 校验 LLM 输出的代码是否具备基本代码特征 */
function isValidGeneratedCode(code: string): boolean {
  if (!code || code.length < 200) return false;
  const hasCodeFeatures =
    code.includes("export default") ||
    code.includes("import ") ||
    code.includes("function ") ||
    code.includes("const ") ||
    code.includes("return (");
  const hasJsx = code.includes("<div") || code.includes("<img") || code.includes("<>");
  return hasCodeFeatures && hasJsx;
}

export const figmaInputNode = async (state: any, config: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("🔧 [FigmaInputNode] 开始获取 Figma 设计数据 (REST API)");
  console.log("=".repeat(80));

  const figmaUrl = state.figmaUrl;
  let userNote = getLastUserText(state.messages);

  // ========== 1. 校验输入 ==========
  if (!figmaUrl) {
    console.error("❌ [FigmaInputNode] 错误: 缺少 figmaUrl");
    throw new Error("FigmaInputNode: 缺少 figmaUrl，请提供 Figma 设计稿链接");
  }

  console.log(`🔗 [FigmaInputNode] Figma URL: ${figmaUrl}`);

  // 用户消息里通常就是这条 Figma 链接本身。
  // 如果原样拼进 Prompt，GLM 可能把链接当作搜索意图，返回空的 tool_call 而非代码，
  // 因此把链接从“补充说明”中剔除，只保留真正的文字需求。
  if (figmaUrl && userNote.includes(figmaUrl)) {
    userNote = userNote.replace(figmaUrl, "").trim();
  }
  userNote = userNote.replace(/https?:\/\/[\w.-]*figma\.com\/[^\s，。；]*/gi, "").trim();

  // ========== 2. 校验令牌 ==========
  const token = process.env.FIGMA_API_KEY?.trim();
  if (!token) {
    console.error("❌ [FigmaInputNode] 缺少 FIGMA_API_KEY");
    throw new Error(
      "未配置 FIGMA_API_KEY（Figma 免费个人访问令牌）。\n" +
        "获取方式（免费）：Figma 账户设置 → Security → Personal access tokens → Generate new token。\n" +
        "然后将令牌填入 server/.env 的 FIGMA_API_KEY。",
    );
  }

  // ========== 3. 解析链接并拉取设计 ==========
  const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
  console.log(
    `📁 [FigmaInputNode] fileKey: ${fileKey}${nodeId ? `, nodeId: ${nodeId}` : ""}`,
  );

  const client = getFigmaRestClient(token);

  let root: any;
  let fileName = "";
  try {
    if (nodeId) {
      console.log("⏳ [FigmaInputNode] 正在通过 REST API 拉取指定节点...");
      const nodesRes = await client.getNodes(fileKey, [nodeId]);
      const nodeEntries = Object.values<any>(nodesRes.nodes || {});
      root = nodeEntries[0]?.document;
      fileName = nodeEntries[0]?.name || "";
      if (!root) {
        throw new Error(`REST API 未返回节点 ${nodeId}，请确认链接和令牌权限`);
      }
    } else {
      console.log("⏳ [FigmaInputNode] 正在通过 REST API 拉取整个文件结构...");
      const file = await client.getFile(fileKey);
      root = file.document;
      fileName = file.name || "";
      if (!root) {
        throw new Error("REST API 未返回文件结构，请确认链接和令牌权限");
      }
    }
  } catch (error) {
    console.error("❌ [FigmaInputNode] 拉取设计数据失败:", error);
    throw new Error(
      `Figma REST API 拉取失败: ${error instanceof Error ? error.message : String(error)}\n` +
        "请确认：\n" +
        "1. FIGMA_API_KEY 已正确配置（免费个人访问令牌）\n" +
        "2. 令牌对应的账号对该设计文件有查看权限\n" +
        "3. 链接格式正确（figma.com/design|file/...）",
    );
  }

  // ========== 4. 渲染图片节点 ==========
  console.log("\n🖼️  [FigmaInputNode] 正在渲染图片资源...");
  const imageIds = collectImageNodeIds(root, 50);
  let imageAssets: Array<{ id: string; varName: string; url: string }> = [];
  if (imageIds.length > 0) {
    try {
      const images = await client.getImages(fileKey, imageIds, {
        format: "png",
        scale: 2,
      });
      let index = 0;
      for (const [id, url] of Object.entries(images)) {
        if (url) {
          imageAssets.push({ id, varName: `img${index}`, url });
          index++;
        }
      }
      console.log(`   ✅ 渲染成功 ${imageAssets.length}/${imageIds.length} 张图片`);
    } catch (error) {
      console.warn(
        "⚠️  [FigmaInputNode] 图片渲染失败，将继续基于结构生成:",
        error,
      );
    }
  } else {
    console.log("   ℹ️ 未发现位图/图片填充节点，跳过图片渲染");
  }

  // ========== 5. 压缩设计结构 ==========
  console.log("\n📐 [FigmaInputNode] 正在压缩设计结构...");
  let compactDesign = buildCompactDesign(root);
  let designContext = JSON.stringify(compactDesign);
  if (designContext.length > 150_000) {
    // 结构过大时收紧压缩参数，避免超出模型上下文
    console.log(
      `   结构过大 (${designContext.length.toLocaleString()} 字符)，收紧压缩参数...`,
    );
    compactDesign = buildCompactDesign(root, {
      maxNodes: 180,
      maxChildren: 10,
      maxTextLength: 60,
    });
    designContext = JSON.stringify(compactDesign);
  }
  console.log(`   设计结构压缩后: ${designContext.length.toLocaleString()} 字符`);

  // 设计令牌（颜色）
  let designTokens = "";
  try {
    const variablesRes = await client.getLocalVariables(fileKey);
    designTokens = summarizeVariables(variablesRes);
    if (designTokens) {
      console.log(`   设计令牌: ${designTokens.length} 字符`);
    }
  } catch (error) {
    console.warn("⚠️  无法获取设计变量，跳过:", error);
  }

  // ========== 6. LLM 生成代码 ==========
  console.log("\n🤖 [FigmaInputNode] 正在调用 LLM 将设计转换为 TSX...");
  const model = getMainModel();
  let rawCode = "";
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const messages = buildFigmaCodegenMessages({
        designContext,
        imageAssets,
        designTokens,
        userNote,
      });
      // GLM 等推理模型会在输出中先消耗大量 token 用于“思考”，
      // 默认 maxTokens=8192 容易被思考耗尽，导致返回空内容。
      // 这里单独提高输出上限，给思考 + 完整代码留足空间。
      // 注意：该版本 @langchain/openai 只从模型实例读取 maxTokens（invoke options 不生效），
      // 因此直接设置实例字段后再调用。
      model.maxTokens = 32768;
      const response = await model.invoke(messages, {
        signal: config?.signal,
      });
      let code = extractTextContent(response.content);
      code = stripCodeFence(code);

      if (!isValidGeneratedCode(code)) {
        // 输出诊断信息，便于定位空响应/截断问题
        const meta = (response as any).response_metadata || {};
        const usage = (response as any).usage_metadata || {};
        console.warn(
          `   📋 响应诊断: contentType=${typeof response.content} toolCalls=${JSON.stringify(
            (response as any).tool_calls || null,
          ).slice(0, 200)} finish=${meta.finish_reason} usage=${JSON.stringify(usage)}`,
        );
        throw new Error(
          `生成的代码缺少基本特征 (${code.length} 字符)，可能被截断或格式错误`,
        );
      }

      rawCode = code;
      console.log(`   ✅ 第 ${attempt} 次尝试生成成功 (${rawCode.length} 字符)`);
      break;
    } catch (error) {
      if (config?.signal?.aborted) throw error;
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`   ⚠️ 第 ${attempt} 次生成失败: ${lastError}`);
    }
  }

  if (!rawCode) {
    console.error("❌ [FigmaInputNode] LLM 代码生成失败");
    throw new Error(
      `Figma 设计转代码失败: ${lastError}\n` +
        "可尝试：1. 稍后重试；2. 检查主模型 API 配置（GLM/DeepSeek）；3. 换一个更简单的设计稿",
    );
  }

  // ========== 7. 统计并返回 ==========
  const codeLength = rawCode.length;
  const lineCount = rawCode.split("\n").length;

  console.log("\n✅ [FigmaInputNode] 代码生成成功");
  console.log(`   文件: ${fileName || fileKey}`);
  console.log(`   📊 代码统计:`);
  console.log(`     - 字符数: ${codeLength.toLocaleString()}`);
  console.log(`     - 行数:   ${lineCount.toLocaleString()}`);
  console.log(`     - 语言:   tsx`);
  console.log(`     - 图片:   ${imageAssets.length} 张`);
  console.log(`   📄 代码预览 (前 300 字符):`);
  console.log(`     ${rawCode.substring(0, 300).replace(/\n/g, "\n     ")}...`);
  console.log("");

  return {
    rawCode,
    codeLength,
    lineCount,
    language: "tsx",
  };
};

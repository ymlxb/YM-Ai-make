import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getMainModel, getMainModelProvider } from "../../agents/utils/model.js";

type AnalysisLike = {
  type?: string;
  summary?: string;
};

const MODEL_ALIASES: Record<string, string> = {
  deepseek: "DeepSeek",
  glm: "GLM",
};

function getLastUserText(messages: any[]): string {
  const lastUser = [...(messages || [])]
    .reverse()
    .find((message) => message?.role === "user");

  return typeof lastUser?.content === "string" ? lastUser.content : "";
}

function answerModelQuestion(text: string): string | null {
  if (!/(什么|哪[个款]|大模型|模型|model)/i.test(text)) {
    return null;
  }

  const provider = getMainModelProvider().toLowerCase();
  const modelName =
    provider === "glm"
      ? process.env.GLM_MODEL || "glm-4-flash"
      : provider === "deepseek"
        ? process.env.DEEPSEEK_MODEL || "deepseek-chat"
        : provider;

  const providerName = MODEL_ALIASES[provider] || provider;
  return `我现在接入的是 ${providerName} 的 ${modelName}。在这个项目里，它主要负责需求分析、页面规划和代码生成。`;
}

export async function generateChatAnswer(params: {
  messages: any[];
  analysis?: AnalysisLike;
  /** 传入 AbortSignal，QA 回答也可被中断 */
  signal?: AbortSignal;
}): Promise<string> {
  const text = getLastUserText(params.messages);
  const directAnswer = answerModelQuestion(text);
  if (directAnswer) return directAnswer;

  try {
    const model = getMainModel();
    const result = await model.invoke(
      [
        new SystemMessage(
          "你是 YM Ai make 的助手。用户当前输入被识别为 QA 或闲聊，不要生成页面或代码。请用简短自然的中文直接回答。",
        ),
        new HumanMessage(
          `用户输入：${text}\n意图类型：${params.analysis?.type || "UNKNOWN"}\n分析摘要：${params.analysis?.summary || ""}`,
        ),
      ],
      { signal: params.signal },
    );

    const content = result.content;
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
  } catch (error) {
    console.warn("[ChatAnswer] Failed to generate answer:", error);
  }

  return "我可以直接回答这类问题，不需要进入页面生成流程。";
}

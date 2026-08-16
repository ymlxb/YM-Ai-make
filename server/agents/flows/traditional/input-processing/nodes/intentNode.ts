import { IntentSchema } from "../schemas/intentSchema.js";
import { IntentPrompts } from "../prompts/intentPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      // Keep plain strings as a single item.
    }

    return [trimmed];
  }

  return [];
}

function normalizeIntentResult(result: any) {
  return {
    ...result,
    product: {
      ...result.product,
      targetUsers: toStringArray(result.product?.targetUsers),
    },
    goals: {
      ...result.goals,
      primary: toStringArray(result.goals?.primary),
      secondary:
        result.goals?.secondary == null
          ? null
          : toStringArray(result.goals.secondary),
    },
    nonGoals: toStringArray(result.nonGoals),
    assumptions:
      result.assumptions == null ? null : toStringArray(result.assumptions),
  };
}

function buildFallbackIntent(summary = "") {
  const isResume = /\u7b80\u5386|resume/i.test(summary);
  const productName = isResume ? "AI简历优化工具" : "智能应用官网";

  return {
    product: {
      name: productName,
      description: summary || `${productName} 的中文产品官网首页`,
      targetUsers: isResume
        ? ["求职者", "应届毕业生", "希望提升简历质量的职场人士"]
        : ["目标用户", "潜在客户", "产品体验用户"],
      primaryScenario: "用户浏览官网，了解产品价值、功能亮点、用户评价和价格方案，并点击立即体验。",
    },
    goals: {
      primary: ["展示产品核心价值", "呈现功能介绍", "引导用户立即体验"],
      secondary: ["展示用户评价", "展示价格套餐", "提升官网专业感"],
    },
    nonGoals: ["不实现真实支付", "不接入真实登录", "不提供后端管理系统"],
    assumptions: ["页面用于作品集和面试展示", "需要中文内容", "需要专业现代的视觉效果"],
    category: "中文产品官网首页",
  };
}

export async function intentNode(state: any, config: any) {
  if (state.skipGeneration) {
    console.log("[IntentNode] skipGeneration=true, skipping.");
    return {
      intent: null,
    };
  }

  const structuredModel = getStructuredModel(IntentSchema);
  const analysisSummary = state.analysis?.summary || "User request";
  const analysisTags = state.analysis?.tags?.join(", ") || "";
  const designContext = state.analysis?.designAnalysis
    ? `\n\nDesign context: ${state.analysis.designAnalysis}`
    : "";
  const contextMessage = `User request summary: ${analysisSummary}\nTags: ${analysisTags}${designContext}`;

  const prompt = [
    new SystemMessage(
      `${IntentPrompts}

Important schema rule:
Fields targetUsers, goals.primary, goals.secondary, nonGoals and assumptions must be real JSON arrays.
Never output array fields as quoted JSON strings.`,
    ),
    new HumanMessage(contextMessage),
  ];

  const mockResult = await tryExecuteMock(
    state,
    "intentNode",
    "intentResult.json",
    "intent",
  );
  if (mockResult) return mockResult;

  console.log("--- User Intent Analysis Start ---");

  try {
    const result = await withRetry(structuredModel, prompt, {
      maxRetries: 2,
      signal: config?.signal,
      onRetry: (attempt, error) => {
        console.warn(
          `[IntentNode] Retry attempt ${attempt} due to:`,
          error.message,
        );
      },
    });

    console.log("--- User Intent Analysis End ---");

    return {
      intent: normalizeIntentResult(result),
    };
  } catch (error) {
    console.warn(
      "[IntentNode] Falling back to deterministic intent:",
      error instanceof Error ? error.message : error,
    );

    return {
      intent: buildFallbackIntent(analysisSummary),
    };
  }
}

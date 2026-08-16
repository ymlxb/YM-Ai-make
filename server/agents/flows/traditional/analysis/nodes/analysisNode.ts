import { AnalysisSchema } from "../schemas/analysisSchema.js";
import { ANALYSIS_SYSTEM_PROMPT } from "../prompts/analysisPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  BaseMessage,
} from "@langchain/core/messages";

async function convertToLangChainMessages(
  rawMessages: any[],
): Promise<BaseMessage[]> {
  return rawMessages.map((msg) => {
    const textContent =
      typeof msg.content === "string" && msg.content.trim()
        ? msg.content
        : "User uploaded an attachment.";

    if (msg.role === "user") {
      return new HumanMessage(textContent);
    }

    return new AIMessage(textContent);
  });
}

function getLatestTextMessage(messages: any[] = []) {
  const lastMsg = messages[messages.length - 1];
  return typeof lastMsg?.content === "string" ? lastMsg.content : "";
}

function hasBuildIntent(text: string) {
  return /\u505a\u4e00\u4e2a|\u505a\u4e2a|\u751f\u6210|\u521b\u5efa|\u5f00\u53d1|\u5b9e\u73b0|\u642d\u5efa|\u8bbe\u8ba1|\u5b98\u7f51|\u9996\u9875|\u9875\u9762|\u7f51\u7ad9|\u5e94\u7528|\u5de5\u5177|\u7cfb\u7edf|\u540e\u53f0|\u4eea\u8868\u76d8|\u5c0f\u7a0b\u5e8f|app/i.test(
    text,
  );
}

function normalizeAnalysisResult(result: any, latestText: string) {
  if (
    hasBuildIntent(latestText) &&
    (result.type === "QA" || result.type === "CHIT_CHAT")
  ) {
    return {
      ...result,
      type: "CREATE",
      summary: result.summary || latestText,
      tags:
        Array.isArray(result.tags) && result.tags.length
          ? result.tags
          : ["app-generation"],
    };
  }

  return result;
}

function buildCreateAnalysis(latestText: string) {
  return {
    type: "CREATE",
    summary: latestText,
    tags: ["app-generation"],
    complexity: "MEDIUM",
    designAnalysis: latestText,
  };
}

export const analysisNode = async (state: any, config: any) => {
  const structuredModel = getStructuredModel(AnalysisSchema);

  let messages: BaseMessage[] = [];
  const latestText = getLatestTextMessage(state.messages);

  if (state.messages && Array.isArray(state.messages)) {
    const lastMsg = state.messages[state.messages.length - 1];
    messages = await convertToLangChainMessages([lastMsg]);
  }

  const prompt = [new SystemMessage(ANALYSIS_SYSTEM_PROMPT), ...messages];

  console.log("\n[AnalysisNode] Start intent analysis");

  if (hasBuildIntent(latestText)) {
    const deterministicResult = buildCreateAnalysis(latestText);
    console.log("[AnalysisNode] Intent:", deterministicResult.type);
    return {
      analysis: deterministicResult,
      skipGeneration: false,
    };
  }

  const mockResult = await tryExecuteMock(
    state,
    "analysisNode",
    "analysisResult.json",
    "analysis",
  );
  if (mockResult) {
    const normalizedAnalysis = normalizeAnalysisResult(
      mockResult.analysis,
      latestText,
    );

    return {
      ...mockResult,
      analysis: normalizedAnalysis,
      skipGeneration:
        normalizedAnalysis?.type === "QA" ||
        normalizedAnalysis?.type === "CHIT_CHAT",
    };
  }

  console.log("--- User Message Analysis Start ---");

  const result = await withRetry(structuredModel, prompt, {
    maxRetries: 3,
    signal: config?.signal,
    onRetry: (attempt, error) => {
      console.warn(
        `[AnalysisNode] Retry attempt ${attempt} due to:`,
        error.message,
      );
    },
  });

  const normalizedResult = normalizeAnalysisResult(result, latestText);

  console.log("--- User Message Analysis End ---");
  console.log("[AnalysisNode] Intent:", normalizedResult.type);

  return {
    analysis: normalizedResult,
    skipGeneration:
      normalizedResult.type === "QA" || normalizedResult.type === "CHIT_CHAT",
  };
};

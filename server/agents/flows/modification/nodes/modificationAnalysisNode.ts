/**
 * 修改请求流程 - 修改分析节点（AI）
 *
 * 职责：
 * 1. 读取用户最近的修改请求 + 当前项目文件清单
 * 2. 用结构化模型把请求解析为“文件级操作计划”（edit / create / delete）
 *
 * 流程位置: Step 1 / 4
 * 上游: START（接收 messages + currentFiles）
 * 下游: modificationLocateNode（把计划映射到真实文件）
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { ModificationPlanSchema } from "../schemas/modificationSchema.js";
import {
  MODIFICATION_ANALYSIS_SYSTEM_PROMPT,
  buildModificationAnalysisHumanPrompt,
} from "../prompts/modificationPrompts.js";
import { getStructuredModel } from "../../../utils/model.js";
import { tryExecuteMock } from "../../../utils/mock.js";
import { withRetry } from "../../../utils/retry.js";

/** 从消息列表提取最近一条用户文本 */
function getLastUserText(messages: any[]): string {
  const lastUser = [...(messages || [])]
    .reverse()
    .find((m) => m?.role === "user");
  if (typeof lastUser?.content === "string") return lastUser.content;
  return "";
}

/** 生成项目文件清单（路径 + 行数），供 LLM 规划时参考 */
function buildFileIndex(files: Record<string, string>): string {
  const entries = Object.entries(files || {})
    .map(([filePath, content]) => {
      const lineCount = (content || "").split("\n").length;
      return `${filePath} (${lineCount} 行)`;
    })
    .sort((a, b) => a.localeCompare(b));

  return entries.length > 0 ? entries.join("\n") : "（当前项目暂无文件）";
}

/** 归一化计划：过滤空路径、按路径去重、限制操作数量 */
function normalizePlan(result: any): any {
  const operations = Array.isArray(result?.operations)
    ? result.operations
        .filter(
          (op: any) =>
            op &&
            typeof op.filePath === "string" &&
            op.filePath.trim().length > 0,
        )
        .map((op: any) => ({
          ...op,
          filePath: op.filePath.trim(),
          reason: op.reason || "根据修改请求推断",
        }))
    : [];

  // 按 filePath 去重（保留第一次出现的操作）
  const seen = new Set<string>();
  const uniqueOperations = operations.filter((op: any) => {
    const key = `${op.action}:${op.filePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ...result,
    summary: result?.summary || "根据用户请求进行代码修改",
    operations: uniqueOperations.slice(0, 8),
    newDependencies: Array.isArray(result?.newDependencies)
      ? result.newDependencies
      : [],
  };
}

export async function modificationAnalysisNode(state: any) {
  const currentFiles: Record<string, string> = state.currentFiles || {};

  if (Object.keys(currentFiles).length === 0) {
    throw new Error(
      "没有找到可修改的已有代码。请先完成一次代码生成，再发起修改请求。",
    );
  }

  const request = getLastUserText(state.messages) || "优化当前页面";
  const fileIndex = buildFileIndex(currentFiles);

  const structuredModel = getStructuredModel(ModificationPlanSchema);

  const mockResult = await tryExecuteMock(
    state,
    "modificationAnalysisNode",
    "modificationPlanResult.json",
    "modificationPlan",
  );
  if (mockResult) {
    return {
      modificationPlan: normalizePlan(mockResult.modificationPlan),
    };
  }

  console.log("--- Modification Analysis Start ---");
  console.log(`Files available: ${Object.keys(currentFiles).length}`);

  const prompt = [
    new SystemMessage(MODIFICATION_ANALYSIS_SYSTEM_PROMPT),
    new HumanMessage(
      buildModificationAnalysisHumanPrompt({ request, fileIndex }),
    ),
  ];

  try {
    const result = await withRetry(structuredModel, prompt, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.warn(
          `[ModificationAnalysisNode] Retry attempt ${attempt} due to:`,
          error.message,
        );
      },
    });

    const plan = normalizePlan(result);
    console.log("--- Modification Analysis End ---");
    console.log(
      `Plan summary: ${plan.summary} | operations: ${plan.operations.length}`,
    );

    return { modificationPlan: plan };
  } catch (error) {
    console.error(
      "[ModificationAnalysisNode] Failed to build plan:",
      error instanceof Error ? error.message : error,
    );
    throw new Error(
      `修改请求分析失败，请尝试把需求描述得更具体一些。${
        error instanceof Error ? `（${error.message}）` : ""
      }`,
    );
  }
}

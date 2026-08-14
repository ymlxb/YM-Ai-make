/**
 * 修改请求流程 - 修改执行节点（AI）
 *
 * 职责：
 * 1. 对每个 edit/create 目标文件，携带“请求原文 + 整体摘要 + 当前内容”调用 LLM，
 *    由 LLM 整文件重写并返回完整代码
 * 2. delete 目标不需要 LLM，直接记录到删除列表
 * 3. 单文件失败不阻断整体流程：edit 回退原文，create 回退占位组件
 *
 * 设计说明：
 * - 采用“整文件重写”而非“diff 补丁”：LLM 对 diff 的格式极其敏感，
 *   整文件重写配合严格 prompt 约束更容易产出可编译代码
 * - 并行执行：每个目标文件独立调用，互不阻塞
 *
 * 流程位置: Step 3 / 4
 * 上游: modificationLocateNode
 * 下游: modificationAssembleNode
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type {
  T_ModificationTarget,
  T_ModifiedFile,
} from "../schemas/modificationSchema.js";
import {
  MODIFICATION_APPLY_SYSTEM_PROMPT,
  buildModificationApplyHumanPrompt,
} from "../prompts/modificationPrompts.js";
import { getModel } from "../../../utils/model.js";
import { tryExecuteMock } from "../../../utils/mock.js";

function getLastUserText(messages: any[]): string {
  const lastUser = [...(messages || [])]
    .reverse()
    .find((m) => m?.role === "user");
  if (typeof lastUser?.content === "string") return lastUser.content;
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
    /^```(?:tsx|typescript|jsx|js|ts)?\s*([\s\S]*?)```\s*$/i,
  );
  return fence ? fence[1].trim() : result;
}

/** 粗略判断输出是否像代码（防止 LLM 返回“已按要求修改”之类的自然语言） */
function looksLikeCode(content: string): boolean {
  if (!content) return false;
  return (
    content.includes("import") ||
    content.includes("export") ||
    content.includes("function") ||
    content.includes("const") ||
    content.includes("return") ||
    content.includes("<")
  );
}

/** 生成占位文件（create 失败时的兜底） */
function buildPlaceholderFile(filePath: string, reason: string): string {
  const componentName =
    filePath
      .split("/")
      .pop()
      ?.replace(/\.(tsx|jsx|ts|js)$/, "")
      .replace(/[^a-zA-Z0-9_$]/g, "") || "NewComponent";

  return `// TODO: 修改生成失败，请手动实现
// 目标: ${filePath}
// 原因: ${reason}

export default function ${componentName}() {
  return (
    <div className="p-4 border border-dashed border-gray-400 rounded">
      <p className="text-gray-500">[${componentName}] 待实现</p>
    </div>
  );
}
`;
}

export async function modificationApplyNode(state: any) {
  const targets: T_ModificationTarget[] = state.modificationTargets || [];
  const plan = state.modificationPlan || {};
  const request = getLastUserText(state.messages);

  if (targets.length === 0) {
    console.warn("[ModificationApply] 没有需要执行的操作");
    return { updatedFiles: [], deletedFiles: [] };
  }

  // 删除操作不需要 LLM
  const deletedFiles: string[] = targets
    .filter((t) => t.action === "delete")
    .map((t) => t.filePath);

  const toGenerate = targets.filter(
    (t) => t.action !== "delete" && t.exists,
  );
  const relatedFiles = targets.map((t) => t.filePath);

  // ---- Mock 模式：不调用 LLM，直接回显原文并追加标记注释 ----
  const mockResult = await tryExecuteMock(
    state,
    "modificationApplyNode",
    "modificationApplyResult.json",
    (data, st) => {
      const mockTargets: T_ModificationTarget[] =
        st.modificationTargets || [];
      return {
        updatedFiles: mockTargets
          .filter((t) => t.action !== "delete" && t.exists)
          .map((t) => ({
            filePath: t.filePath,
            content: `${
              t.currentContent || ""
            }\n\n// [mock] 模拟修改：${st.modificationPlan?.summary || ""}`,
          })),
        deletedFiles: mockTargets
          .filter((t) => t.action === "delete")
          .map((t) => t.filePath),
      };
    },
  );
  if (mockResult) return mockResult;

  console.log(
    `--- Modification Apply Start (${toGenerate.length} files) ---`,
  );

  const model = getModel();

  const results: T_ModifiedFile[] = await Promise.all(
    toGenerate.map(async (target) => {
      const humanPrompt = buildModificationApplyHumanPrompt({
        request,
        summary: plan.summary || request,
        action: target.action as "edit" | "create",
        filePath: target.filePath,
        currentContent: target.currentContent,
        relatedFiles,
      });

      try {
        const response = await model.invoke([
          new SystemMessage(MODIFICATION_APPLY_SYSTEM_PROMPT),
          new HumanMessage(humanPrompt),
        ]);

        let content = stripCodeFence(
          extractTextContent(response.content),
        );

        // 防呆：LLM 输出不像代码时，edit 回退原文
        if (!looksLikeCode(content) && target.action === "edit") {
          console.warn(
            `[ModificationApply] ${target.filePath} 输出不像代码，回退原文`,
          );
          content = target.currentContent || "";
        }

        console.log(
          `  ✓ ${target.filePath} (${content.length} chars)`,
        );
        return { filePath: target.filePath, content };
      } catch (error) {
        console.error(
          `  ✗ ${target.filePath} 修改失败:`,
          error instanceof Error ? error.message : error,
        );
        return {
          filePath: target.filePath,
          content:
            target.action === "edit"
              ? target.currentContent || ""
              : buildPlaceholderFile(target.filePath, target.reason),
        };
      }
    }),
  );

  console.log(`--- Modification Apply End ---`);

  return { updatedFiles: results, deletedFiles };
}

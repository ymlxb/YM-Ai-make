/**
 * 修改请求流程 - 目标定位节点（确定性，无 LLM）
 *
 * 职责：
 * 1. 把修改计划里的文件路径归一化（补 /、去掉 /src/ 前缀）
 * 2. 把路径映射到当前代码里的真实文件，并取出内容快照
 * 3. create 目标若已存在则降级为 edit；edit 目标找不到则抛出明确错误
 *
 * 流程位置: Step 2 / 4
 * 上游: modificationAnalysisNode
 * 下游: modificationApplyNode
 */

import type { T_ModificationPlan } from "../schemas/modificationSchema.js";

/** 归一化 Sandpack 文件路径 */
export function normalizeFilePath(filePath: string): string {
  let normalized = filePath.trim();
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.startsWith("/src/")) {
    normalized = normalized.replace("/src/", "/");
  }
  return normalized;
}

/** 模糊匹配：优先精确匹配，其次按“路径后缀 / 文件名”匹配 */
function matchFilePath(
  target: string,
  availablePaths: string[],
): string | undefined {
  if (availablePaths.includes(target)) return target;

  const targetBase = target.split("/").pop();

  // 1. 后缀匹配：/components/Hero.tsx 命中 /src/components/Hero.tsx
  const suffixMatch = availablePaths.find((p) => p.endsWith(target));
  if (suffixMatch) return suffixMatch;

  // 2. 文件名匹配：Hero.tsx 命中任意目录下的 Hero.tsx
  if (targetBase) {
    const baseMatch = availablePaths.find(
      (p) => p.split("/").pop() === targetBase,
    );
    if (baseMatch) return baseMatch;
  }

  return undefined;
}

export async function modificationLocateNode(state: any) {
  const plan: T_ModificationPlan | undefined = state.modificationPlan;
  const currentFiles: Record<string, string> = state.currentFiles || {};
  const availablePaths = Object.keys(currentFiles);

  if (!plan || !Array.isArray(plan.operations)) {
    throw new Error("修改计划为空，无法定位目标文件");
  }

  const targets = plan.operations.map((op) => {
    const normalizedPath = normalizeFilePath(op.filePath);
    let resolvedPath = normalizedPath;
    let action = op.action;

    if (action === "edit") {
      const matched = matchFilePath(normalizedPath, availablePaths);
      if (matched) {
        resolvedPath = matched;
      }
    } else if (action === "create" && availablePaths.includes(normalizedPath)) {
      // 计划新建但文件已存在 → 降级为修改
      console.warn(
        `[ModificationLocate] ${normalizedPath} 已存在，create 降级为 edit`,
      );
      action = "edit";
    }

    const exists = Object.prototype.hasOwnProperty.call(
      currentFiles,
      resolvedPath,
    );

    return {
      action,
      filePath: resolvedPath,
      reason: op.reason,
      currentContent: exists ? currentFiles[resolvedPath] : null,
      exists,
    };
  });

  // edit 目标必须能找到真实文件，否则给出可定位的明确错误
  const missingEditTargets = targets.filter(
    (t) => t.action === "edit" && !t.exists,
  );
  if (missingEditTargets.length > 0) {
    const missing = missingEditTargets.map((t) => t.filePath).join(", ");
    throw new Error(
      `无法在现有代码中找到需要修改的文件：${missing}。\n当前项目包含：${
        availablePaths.length > 0
          ? availablePaths.join(", ")
          : "（无文件）"
      }`,
    );
  }

  console.log(
    `[ModificationLocate] Resolved ${targets.length} targets:`,
    targets.map((t) => `${t.action}:${t.filePath}`).join(", "),
  );

  return { modificationTargets: targets };
}

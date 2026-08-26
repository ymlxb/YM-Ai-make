/**
 * 修改请求流程 - 组装节点（确定性，无 LLM）
 *
 * 职责：
 * 1. 以“当前文件”为基础，合并修改结果（新增 / 修改 / 删除）
 * 2. 模板文件兜底（index.tsx / package.json / App.tsx / styles.css 缺失时补齐），
 *    保证修改后依然是完整可运行的 Sandpack 项目
 * 3. 重建 package.json：扫描代码 import，合并模板依赖（新增依赖自动补齐）
 * 4. AST 后处理（复用传统流程的 fixer），最后输出 Sandpack 格式 + 变更统计
 *
 * 流程位置: Step 4 / 4
 * 上游: modificationApplyNode
 * 下游: END
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  scanDependencies,
  buildPackageJson,
  readTemplatePackageJson,
} from "../../../utils/dependencyBuilder.js";
import { normalizeCodeContent } from "../../../utils/codeNormalizer.js";
import {
  postProcessFiles,
  printFixReport,
} from "../../../utils/ast/fixer.js";
import { fixImportCaseInFiles } from "../../../utils/importFixer.js";
import { sanitizeSandboxCode } from "../../../utils/sandboxSanitizer.js";
import { repairGeneratedCode } from "../../../utils/syntaxGuard.js";
import { normalizeFilePath } from "./modificationLocateNode.js";

/** 修改流程的输出结构（兼容 Sandpack，同时携带变更统计） */
interface ModificationOutput {
  files: Record<string, string>;
  stats?: {
    totalFiles: number;
    categories: Record<string, number>;
    changes?: {
      added: string[];
      modified: string[];
      deleted: string[];
    };
    astFixes?: number;
    astIssues?: number;
  };
}

/** 模板兜底：保证项目入口与依赖声明始终存在 */
const TEMPLATE_BASE_FILES = [
  "index.tsx",
  "prelude.ts",
  "package.json",
  "App.tsx",
  "styles.css",
];

function getCategory(filePath: string): string {
  if (filePath === "/package.json") return "config";
  if (filePath.endsWith(".css")) return "styles";
  if (filePath.startsWith("/components/")) return "components";
  if (filePath.startsWith("/pages/")) return "pages";
  if (filePath.startsWith("/layouts/")) return "layouts";
  if (filePath.startsWith("/hooks/")) return "hooks";
  if (filePath.startsWith("/types/")) return "types";
  if (filePath.startsWith("/utils/")) return "utils";
  if (filePath.startsWith("/services/") || filePath.startsWith("/api/")) {
    return "service";
  }
  if (filePath === "/index.tsx" || filePath === "/App.tsx") return "entry";
  return "other";
}

/** 读取模板文件内容（缺失时返回 null） */
async function readTemplateFile(name: string): Promise<string | null> {
  try {
    const templatePath = path.resolve(
      process.cwd(),
      `templates/react-ts/${name}`,
    );
    return await fs.readFile(templatePath, "utf-8");
  } catch {
    return null;
  }
}

export async function modificationAssembleNode(state: any) {
  console.log(`--- ModificationAssembleNode Start ---`);

  const currentFiles: Record<string, string> = state.currentFiles || {};
  const updatedFiles: Array<{ filePath: string; content?: string | null }> =
    state.updatedFiles || [];
  const deletedFiles: string[] = state.deletedFiles || [];

  // ===== 1. 基础 = 当前文件（归一化路径） =====
  const files: Record<string, string> = {};
  for (const [filePath, content] of Object.entries(currentFiles)) {
    files[normalizeFilePath(filePath)] = content;
  }

  // ===== 2. 模板兜底 =====
  for (const name of TEMPLATE_BASE_FILES) {
    const normalized = normalizeFilePath(name);
    if (!files[normalized]) {
      const content = await readTemplateFile(name);
      if (content !== null) {
        files[normalized] = content;
      }
    }
  }

  // ===== 3. 应用修改 =====
  const added: string[] = [];
  const modified: string[] = [];

  for (const file of updatedFiles) {
    if (!file.content) continue;
    const normalized = normalizeFilePath(file.filePath);
    const existed = Object.prototype.hasOwnProperty.call(files, normalized);
    files[normalized] = normalizeCodeContent(file.content);
    if (existed) {
      if (!modified.includes(normalized)) modified.push(normalized);
    } else {
      if (!added.includes(normalized)) added.push(normalized);
    }
  }

  const deleted: string[] = [];
  for (const filePath of deletedFiles) {
    const normalized = normalizeFilePath(filePath);
    if (Object.prototype.hasOwnProperty.call(files, normalized)) {
      delete files[normalized];
      deleted.push(normalized);
    }
  }

  // ===== 4. 重建 package.json（扫描 import 自动补依赖） =====
  try {
    let basePkg: any = null;
    if (files["/package.json"]) {
      try {
        basePkg = JSON.parse(files["/package.json"]);
      } catch {
        basePkg = null;
      }
    }
    if (!basePkg) {
      basePkg = await readTemplatePackageJson();
    }

    const codeFiles = Object.entries(files)
      .filter(
        ([p]) =>
          p.endsWith(".ts") ||
          p.endsWith(".tsx") ||
          p.endsWith(".js") ||
          p.endsWith(".jsx"),
      )
      .map(([p, code]) => ({ path: p, code }));

    const scannedDeps = scanDependencies(codeFiles);
    const { packageJson: finalPkg } = buildPackageJson(scannedDeps, basePkg);
    files["/package.json"] = JSON.stringify(finalPkg, null, 2);
  } catch (error) {
    console.warn(
      "[ModificationAssemble] 依赖重建失败（保留原 package.json）:",
      error,
    );
  }

  // ===== 5. AST 后处理（复用传统流程 fixer） =====
  // 5.0 先修正相对 import 大小写/扩展名（Sandpack/Linux 大小写敏感）
  Object.assign(files, fixImportCaseInFiles(files));
  // 5.1 移除 Next.js 专用库（next-themes / next/*），保证沙箱可编译
  Object.assign(files, sanitizeSandboxCode(files));
  // 5.2 语法校验与修复：保证修改后的项目一定可编译
  const syntaxResult = repairGeneratedCode(files);
  Object.assign(files, syntaxResult.files);
  // 5.3 入口文件固定为模板（保证一定执行挂载 + 错误可见化）
  const entryIndex = await readTemplateFile("index.tsx");
  const entryPrelude = await readTemplateFile("prelude.ts");
  if (entryIndex) files["/index.tsx"] = entryIndex;
  if (entryPrelude) files["/prelude.ts"] = entryPrelude;

  let astFixes = 0;
  let astIssues = 0;
  try {
    const { files: fixedFiles, result } = postProcessFiles(files);
    printFixReport(result);
    if (result.totalFixes > 0) {
      Object.assign(files, fixedFiles);
      astFixes = result.totalFixes;
      astIssues = result.totalIssues;
    }
  } catch (error) {
    console.error("[ModificationAssemble] AST 后处理失败，继续使用原文件:", error);
  }

  // ===== 6. 统计输出 =====
  const totalFiles = Object.keys(files).length;
  const categories: Record<string, number> = {};
  for (const filePath of Object.keys(files)) {
    const category = getCategory(filePath);
    categories[category] = (categories[category] || 0) + 1;
  }

  const result: ModificationOutput = {
    files,
    stats: {
      totalFiles,
      categories,
      changes: {
        added,
        modified,
        deleted,
      },
      astFixes,
      astIssues,
    },
  };

  console.log(`--- ModificationAssembleNode Complete ---`);
  console.log(`Total files: ${totalFiles}`);
  console.log(
    `Changes -> added: ${added.length}, modified: ${modified.length}, deleted: ${deleted.length}`,
  );

  return { files: result };
}

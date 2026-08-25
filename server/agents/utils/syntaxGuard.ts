/**
 * 语法卫士（确定性，无 LLM）
 *
 * LLM 偶尔会生成带语法错误的代码（最常见的是 useState 解构多打一个括号：
 * `const [data, setData]] = useState(...)`），这类错误会让整个项目编译失败，
 * 预览停留在模板。
 *
 * 策略：
 * 1. 用 Babel 逐文件解析，只有解析失败的才处理
 * 2. 先尝试针对常见笔误的确定性修复（双 ]、双 }）
 * 3. 仍失败的文件：hooks/组件替换为可编译的兜底，其他文件保留原文并告警
 */

import { parse } from "@babel/parser";

function isCodeFile(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

function isParsable(code: string, filePath: string): boolean {
  if (!code) return true;
  try {
    const plugins: any[] = [];
    if (/\.tsx?$/.test(filePath)) plugins.push("typescript");
    if (/\.(tsx|jsx)$/.test(filePath)) plugins.push("jsx");
    parse(code, { sourceType: "module", plugins });
    return true;
  } catch {
    return false;
  }
}

/** 针对 LLM 常见笔误的确定性修复（修复后必须能通过解析才生效） */
const COMMON_FIXES: Array<{ name: string; re: RegExp; to: string }> = [
  // const [a, b]] = useState(...)  →  const [a, b] = useState(...)
  {
    name: "double-bracket-destructure",
    re: /(\[[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*)\]\]/g,
    to: "$1]",
  },
  // const {a, b}} = ...  →  const {a, b} = ...
  {
    name: "double-brace-destructure",
    re: /(\{[A-Za-z_$][\w$]*\s*,\s*[A-Za-z_$][\w$]*)\}\}/g,
    to: "$1}",
  },
];

/** 生成可编译的兜底文件（尽量保留原文件的导出名） */
function buildSafeFallback(filePath: string, brokenCode: string): string {
  const baseName =
    filePath.split("/").pop()?.replace(/\.(tsx?|jsx?)$/, "") || "Generated";
  const isHook = filePath.includes("/hooks/") || baseName.startsWith("use");
  const isComponent = /\.(tsx|jsx)$/.test(filePath);

  const exportedNames = new Set<string>();
  for (const m of brokenCode.matchAll(
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    exportedNames.add(m[1]);
  }

  if (isHook) {
    const fns = [...exportedNames].filter((n) => n !== "default");
    const hookNames = fns.length > 0 ? fns : [baseName];
    const bodies = hookNames
      .map(
        (name) => `export function ${name}(..._args: any[]) {
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(false);
  }, []);
  return { data, loading };
}
`,
      )
      .join("\n");
    return `import { useState, useEffect } from 'react';\n\n${bodies}`;
  }

  if (isComponent) {
    const name = /^[A-Z]/.test(baseName) ? baseName : `Generated${baseName}`;
    const extraExports = [...exportedNames]
      .filter((n) => n !== "default" && n !== name)
      .map((n) => `export const ${n}: any = undefined;\n`)
      .join("");
    return `import React from 'react';\n\nexport default function ${name}() {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
      [${name}] 代码生成失败，已使用兜底组件
    </div>
  );
}
${extraExports}`;
  }

  // 其他文件（types/data/services/utils 等）：保留可解析的最小导出
  const lines: string[] = [];
  for (const name of exportedNames) {
    lines.push(`export type ${name} = any;`);
  }
  if (lines.length === 0) lines.push("export {};");
  return lines.join("\n");
}

/**
 * 校验并修复文件集中的语法错误，返回修复后的文件集与统计。
 */
export function repairGeneratedCode(
  files: Record<string, string>,
): { files: Record<string, string>; repairedCount: number; replacedCount: number } {
  const out: Record<string, string> = {};
  let repairedCount = 0;
  let replacedCount = 0;

  for (const [filePath, code] of Object.entries(files)) {
    if (!isCodeFile(filePath) || isParsable(code, filePath)) {
      out[filePath] = code;
      continue;
    }

    // 1. 尝试常见笔误修复
    let fixed = code;
    for (const fix of COMMON_FIXES) {
      fixed = fixed.replace(fix.re, fix.to);
    }
    if (isParsable(fixed, filePath)) {
      out[filePath] = fixed;
      repairedCount++;
      console.log(`[SyntaxGuard] 已修复 ${filePath} 的语法错误`);
      continue;
    }

    // 2. hooks / 组件 → 兜底；其余保留原文并告警
    if (
      filePath.includes("/hooks/") ||
      filePath.endsWith(".tsx") ||
      filePath.endsWith(".jsx")
    ) {
      out[filePath] = buildSafeFallback(filePath, code);
      replacedCount++;
      console.warn(
        `[SyntaxGuard] ${filePath} 语法错误且无法自动修复，已替换为兜底`,
      );
    } else {
      out[filePath] = code;
      console.warn(
        `[SyntaxGuard] ${filePath} 语法错误且无法自动修复，保留原文（可能导致编译失败）`,
      );
    }
  }

  return { files: out, repairedCount, replacedCount };
}

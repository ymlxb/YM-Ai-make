/**
 * Sandbox 兼容清理器（确定性，无 LLM）
 *
 * LLM 偶尔会在生成代码里使用 Next.js 专用库（最常见的是 next-themes），
 * 而 Sandpack 是纯 Vite/esbuild 环境，解析不到 next/* 模块会直接编译失败，
 * 表现就是：文件都生成了、文件树能看到，但预览停留在上一次成功的模板页。
 *
 * 处理：
 * 1. 移除 next-themes / next/* 的 import（含 type import）
 * 2. 移除 next-themes 的 <ThemeProvider> 包裹，保留子元素
 * 3. 从 package.json 移除 next-themes 依赖
 */

const NEXT_ONLY_IMPORT_RE =
  /^\s*import\s+(?:type\s+)?[^\n]*?from\s*['"](?:next-themes|next\/[^'"]+)['"];\s*\n/gm;
const NEXT_ONLY_SIDE_EFFECT_RE =
  /^\s*import\s+['"](?:next-themes|next\/[^'"]+)['"];\s*\n/gm;

export function sanitizeSandboxCode(
  files: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [filePath, code] of Object.entries(files)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
      out[filePath] = code;
      continue;
    }

    let cleaned = code
      // 1. 移除 next-themes / next/* 的 import
      .replace(NEXT_ONLY_IMPORT_RE, "")
      .replace(NEXT_ONLY_SIDE_EFFECT_RE, "")
      // 2. 移除 <ThemeProvider ...> 包裹，保留子元素
      .replace(/\s*<ThemeProvider[^>]*>\s*/g, "\n")
      .replace(/\s*<\/ThemeProvider>\s*/g, "\n")
      .replace(/^\s*\n/gm, "");

    out[filePath] = cleaned;
  }

  // 3. package.json 移除 next-themes 依赖（不再被引用，避免无谓解析）
  try {
    const pkg = JSON.parse(out["/package.json"] || "{}");
    if (pkg?.dependencies?.["next-themes"]) {
      delete pkg.dependencies["next-themes"];
    }
    out["/package.json"] = JSON.stringify(pkg, null, 2);
  } catch {
    // 解析失败则保留原 package.json
  }

  return out;
}

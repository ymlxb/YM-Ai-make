/**
 * 相对 import 路径修正器（确定性，无 LLM）
 *
 * 问题：LLM 生成的代码经常出现 import 路径与真实文件名大小写不一致，
 * 例如文件是 /types/transaction.ts，却被写成 ../types/Transaction.ts。
 * Windows 本地开发不区分大小写所以能跑，但 Sandpack 打包器运行在 Linux 上
 * 大小写敏感，会直接报"模块找不到"，导致预览空白。
 *
 * 修复策略：
 * 1. 用全部文件路径建立"小写 → 真实路径"映射
 * 2. 遍历每个代码文件，找出所有相对 import（./ 或 ../ 开头）
 * 3. 解析到绝对路径（处理 . 和 ..），依次尝试补扩展名
 * 4. 按小写匹配真实文件，若大小写/扩展名不一致则重写为正确写法
 * 5. 匹配不到的真实 import 原样保留，绝不臆造
 */

const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".css", ".json"];

function normalizePath(input: string): string {
  const parts = input.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

function toRelative(fromDir: string, target: string): string {
  const fromParts = fromDir.split("/").filter(Boolean);
  const targetParts = target.split("/").filter(Boolean);

  let i = 0;
  while (
    i < fromParts.length &&
    i < targetParts.length &&
    fromParts[i] === targetParts[i]
  ) {
    i++;
  }

  const ups = fromParts.length - i;
  const downs = targetParts.slice(i);
  const rel = [...Array(ups).fill(".."), ...downs].join("/");

  if (!rel) return ".";
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function resolveRelative(
  dir: string,
  spec: string,
  byLower: Map<string, string>,
): string | null {
  const absolute = normalizePath(`${dir}/${spec}`);

  for (const ext of EXTENSIONS) {
    const candidate = ext ? `${absolute}${ext}` : absolute;
    const actual = byLower.get(candidate.toLowerCase());
    if (actual) {
      // 已与真实文件一致，无需修改
      if (actual === candidate) return spec;
      return toRelative(dir, actual);
    }
  }

  return null;
}

/**
 * 修正文件集中的相对 import 大小写/扩展名，返回新文件集。
 */
export function fixImportCaseInFiles(
  files: Record<string, string>,
): Record<string, string> {
  const byLower = new Map<string, string>();
  for (const key of Object.keys(files)) {
    byLower.set(key.toLowerCase(), key);
  }

  const fixed: Record<string, string> = {};

  for (const [filePath, code] of Object.entries(files)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
      fixed[filePath] = code;
      continue;
    }

    const dir = filePath.slice(0, filePath.lastIndexOf("/")) || "/";

    fixed[filePath] = code.replace(
      /((?:from|import)\s+)(['"])(\.\.?\/[^'"]+)\2/g,
      (_match: string, prefix: string, quote: string, spec: string) => {
        const corrected = resolveRelative(dir, spec, byLower);
        return corrected
          ? `${prefix}${quote}${corrected}${quote}`
          : _match;
      },
    );
  }

  return fixed;
}

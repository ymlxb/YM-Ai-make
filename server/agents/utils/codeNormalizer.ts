/**
 * Code normalization helpers for LLM-generated source files.
 *
 * Some models may return code with JSON/string escapes or HTML entities
 * inside TSX content. Sandpack receives the normalized code only.
 */

const HTML_ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&gt;/g, ">"],
  [/&lt;/g, "<"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&#x27;/gi, "'"],
  [/&amp;/g, "&"],
];

export function normalizeCodeContent(content: string): string {
  if (!content) return content;

  let normalized = content;

  for (const [pattern, replacement] of HTML_ENTITY_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  const hasLiteralEscapes =
    normalized.includes("\\n") ||
    normalized.includes("\\t") ||
    normalized.includes('\\"') ||
    normalized.includes("\\'");

  if (!hasLiteralEscapes) {
    return normalized;
  }

  return normalized
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

export function normalizeCodeFile<
  T extends { content?: string; code?: string },
>(file: T): T {
  if (!file) return file;

  const result = { ...file };

  if (result.content) {
    result.content = normalizeCodeContent(result.content);
  }

  if (result.code) {
    result.code = normalizeCodeContent(result.code);
  }

  return result;
}

export function normalizeCodeFiles<
  T extends { content?: string; code?: string },
>(files: T[]): T[] {
  if (!files || !Array.isArray(files)) return files;
  return files.map(normalizeCodeFile);
}

export function normalizeLLMResult<T>(result: T): T {
  if (!result || typeof result !== "object") return result;

  const normalized = { ...result } as any;

  if (normalized.content && typeof normalized.content === "string") {
    normalized.content = normalizeCodeContent(normalized.content);
  }

  if (normalized.code && typeof normalized.code === "string") {
    normalized.code = normalizeCodeContent(normalized.code);
  }

  if (normalized.files && Array.isArray(normalized.files)) {
    normalized.files = normalizeCodeFiles(normalized.files);
  }

  if (normalized.layoutsCode && Array.isArray(normalized.layoutsCode)) {
    normalized.layoutsCode = normalizeCodeFiles(normalized.layoutsCode);
  }

  if (normalized.componentsCode && Array.isArray(normalized.componentsCode)) {
    normalized.componentsCode = normalizeCodeFiles(normalized.componentsCode);
  }

  return normalized;
}

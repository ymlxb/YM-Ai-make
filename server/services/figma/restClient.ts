/**
 * Figma REST API 客户端（免费方案）
 *
 * 使用 Figma 官方 REST API + 个人访问令牌（免费）读取设计文件，
 * 替代旧版依赖 Figma Desktop 内置 MCP（付费 Dev Mode 能力）的方案。
 *
 * 相关端点：
 *   GET /v1/files/:key                - 文件结构
 *   GET /v1/files/:key/nodes          - 指定节点结构
 *   GET /v1/images/:key               - 节点图片渲染
 *   GET /v1/files/:key/variables/local - 本地变量（颜色令牌）
 */

const FIGMA_API_BASE = "https://api.figma.com/v1";

// ==================== URL 解析 ====================

export interface ParsedFigmaUrl {
  fileKey: string;
  nodeId?: string;
}

const FIGMA_URL_REGEX =
  /figma\.com\/(?:file|design|proto|board|site|community\/file)\/([A-Za-z0-9_-]+)/i;

/**
 * 从 Figma 链接解析 fileKey 和可选 node-id
 * 示例: https://www.figma.com/design/AbC123/My-Design?node-id=1-234
 */
export function parseFigmaUrl(url: string): ParsedFigmaUrl {
  const match = url.match(FIGMA_URL_REGEX);
  if (!match) {
    throw new Error(`无法解析 Figma 链接: ${url}`);
  }
  const fileKey = match[1];
  const nodeIdParam = url.match(/[?&]node-id=([^&#]+)/i)?.[1];
  // REST API 使用冒号分隔节点 ID，网页链接中通常为短横线
  const nodeId = nodeIdParam ? nodeIdParam.replace(/-/g, ":") : undefined;
  return { fileKey, nodeId };
}

// ==================== 设计结构压缩 ====================

interface CompactOptions {
  maxDepth?: number;
  maxChildren?: number;
  maxNodes?: number;
  maxTextLength?: number;
}

const DEFAULT_COMPACT_OPTIONS: Required<CompactOptions> = {
  maxDepth: 10,
  maxChildren: 16,
  maxNodes: 300,
  maxTextLength: 100,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function rgbaString(
  color: { r: number; g: number; b: number; a?: number },
  opacity?: number,
): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a !== undefined ? color.a : opacity ?? 1;
  if (a >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${round2(a)})`;
}

function summarizeFills(fills: any[]): any[] {
  return (fills || [])
    .filter((f) => f && f.visible !== false && f.opacity !== 0)
    .map((f) => {
      if (f.type === "SOLID" && f.color) {
        return { type: "SOLID", color: rgbaString(f.color, f.opacity) };
      }
      if (typeof f.type === "string" && f.type.startsWith("GRADIENT")) {
        const first = f.gradientStops?.[0]?.color;
        return {
          type: f.type,
          color: first ? rgbaString(first, f.opacity) : undefined,
        };
      }
      return { type: f.type };
    });
}

/**
 * 将 Figma 节点树压缩为适合 LLM 的紧凑结构
 * 保留布局、样式、文本等关键信息，截断过深的子树
 */
export function buildCompactDesign(
  node: any,
  options: CompactOptions = {},
): any {
  const opts: Required<CompactOptions> = {
    ...DEFAULT_COMPACT_OPTIONS,
    ...options,
  };
  let counter = 0;

  const walk = (n: any, depth: number): any => {
    if (!n || counter >= opts.maxNodes) return null;
    counter++;

    const out: any = {};
    for (const key of [
      "id",
      "name",
      "type",
      "x",
      "y",
      "width",
      "height",
      "rotation",
      "opacity",
      "visible",
      "layoutMode",
      "itemSpacing",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "primaryAxisAlignItems",
      "counterAxisAlignItems",
      "primaryAxisSizingMode",
      "counterAxisSizingMode",
    ]) {
      if (n[key] !== undefined && n[key] !== null) out[key] = n[key];
    }

    if (typeof n.cornerRadius === "number") {
      out.cornerRadius = round2(n.cornerRadius);
    }
    if (Array.isArray(n.fills) && n.fills.length > 0) {
      const fills = summarizeFills(n.fills);
      if (fills.length > 0) out.fills = fills;
    }

    if (typeof n.characters === "string" && n.characters.length > 0) {
      out.characters =
        n.characters.length > opts.maxTextLength
          ? n.characters.slice(0, opts.maxTextLength) + "…"
          : n.characters;
      for (const key of [
        "fontSize",
        "fontWeight",
        "fontFamily",
        "lineHeightPx",
        "letterSpacing",
        "textAlignHorizontal",
        "textAlignVertical",
      ]) {
        if (n[key] !== undefined && n[key] !== null) out[key] = n[key];
      }
    }

    if (
      depth < opts.maxDepth &&
      Array.isArray(n.children) &&
      n.children.length > 0
    ) {
      const children = n.children
        .slice(0, opts.maxChildren)
        .map((c: any) => walk(c, depth + 1))
        .filter(Boolean);
      if (children.length > 0) out.children = children;
    }

    return out;
  };

  const root = walk(node, 0);
  if (root && counter >= opts.maxNodes) {
    root.__truncated = true;
  }
  return root;
}

/**
 * 收集需要渲染为位图的节点 id（包含 IMAGE 填充）
 */
export function collectImageNodeIds(node: any, cap = 50): string[] {
  const ids: string[] = [];
  const walk = (n: any) => {
    if (!n || ids.length >= cap) return;
    const hasImageFill =
      Array.isArray(n.fills) &&
      n.fills.some((f: any) => f && f.type === "IMAGE" && f.visible !== false);
    if (hasImageFill && n.id && !ids.includes(n.id)) ids.push(n.id);
    if (Array.isArray(n.children)) {
      for (const child of n.children) walk(child);
    }
  };
  walk(node);
  return ids;
}

// ==================== 变量 → 设计令牌 ====================

/**
 * 将 Figma 变量响应压缩为颜色令牌摘要（JSON 字符串）
 */
export function summarizeVariables(variablesRes: any): string {
  const variables: Record<string, any> = variablesRes?.meta?.variables || {};
  const colors: Record<string, string> = {};

  for (const [id, v] of Object.entries<any>(variables)) {
    if (!v || v.resolvedType !== "COLOR") continue;
    const modeValue = v.valuesByMode
      ? Object.values<any>(v.valuesByMode)[0]
      : null;
    if (!modeValue) continue;
    colors[v.name || id] = rgbaString(modeValue);
  }

  const entries = Object.entries(colors).slice(0, 40);
  if (entries.length === 0) return "";
  return JSON.stringify(Object.fromEntries(entries), null, 1);
}

// ==================== REST 客户端 ====================

export class FigmaRestClient {
  private token: string;

  constructor(token: string) {
    this.token = token.trim();
  }

  private async request<T>(path: string): Promise<T> {
    // 免费令牌有接口限流（429），遇到时退避重试，避免偶发限流直接中断生成
    const MAX_ATTEMPTS = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(`${FIGMA_API_BASE}${path}`, {
        headers: { "X-Figma-Token": this.token },
      });
      if (response.ok) {
        return (await response.json()) as T;
      }

      const body = await response.text().catch(() => "");
      lastError = new Error(
        `Figma REST API ${response.status} ${response.statusText}: ${body.slice(0, 300)}`,
      );

      if (response.status === 429 && attempt < MAX_ATTEMPTS) {
        const waitMs = 20_000 * attempt;
        console.warn(
          `[FigmaRestClient] 触发限流 (429)，${waitMs / 1000}s 后重试 (${attempt}/${MAX_ATTEMPTS - 1})`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      break;
    }

    throw lastError;
  }

  /** 获取完整文件结构 */
  async getFile(fileKey: string): Promise<any> {
    return this.request(`/files/${fileKey}`);
  }

  /** 获取指定节点结构（ids 需为冒号分隔的节点 id） */
  async getNodes(fileKey: string, ids: string[]): Promise<any> {
    const encoded = ids.map(encodeURIComponent).join(",");
    return this.request(`/files/${fileKey}/nodes?ids=${encoded}`);
  }

  /** 渲染节点图片，返回 { nodeId: url | null } */
  async getImages(
    fileKey: string,
    ids: string[],
    options: { format?: "png" | "jpg"; scale?: number } = {},
  ): Promise<Record<string, string | null>> {
    const format = options.format || "png";
    const scale = options.scale ?? 2;
    const result: Record<string, string | null> = {};

    // 单次请求最多 100 个 id
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const encoded = chunk.map(encodeURIComponent).join(",");
      const res = await this.request<any>(
        `/images/${fileKey}?ids=${encoded}&format=${format}&scale=${scale}`,
      );
      Object.assign(result, res.images || {});
    }
    return result;
  }

  /** 获取本地变量（设计令牌），失败返回 null */
  async getLocalVariables(fileKey: string): Promise<any | null> {
    try {
      return await this.request(`/files/${fileKey}/variables/local`);
    } catch (error) {
      console.warn("[FigmaRestClient] 获取变量失败:", error);
      return null;
    }
  }
}

let clientInstance: FigmaRestClient | null = null;

/** 获取 Figma REST 客户端单例 */
export function getFigmaRestClient(token: string): FigmaRestClient {
  if (!clientInstance) {
    clientInstance = new FigmaRestClient(token);
  }
  return clientInstance;
}

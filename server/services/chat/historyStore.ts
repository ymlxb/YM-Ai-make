/**
 * 会话历史存储（服务端短期记忆）
 *
 * 作用：由服务端统一管理对话历史（而不是依赖前端每次全量携带），
 * 按 base projectId 落盘，支持刷新页面后继续对话、跨流程（传统/修改）共享上下文。
 *
 * 存储位置：server/data/history/<projectId>.json
 * 策略：
 * - 按消息 id 去重（网络重试不会重复记录）
 * - 只保留用户消息与有内容的助手消息
 * - 截断为最近 MAX_MESSAGES 条，防止无限增长
 */

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

// Vercel Serverless 的 cwd 只读，落到 /tmp（实例内可写）；
// 本地开发仍使用项目内 data/history
const DATA_DIR =
  process.env.VERCEL === "1"
    ? path.join(os.tmpdir(), "ym-ai-make", "history")
    : path.resolve(process.cwd(), "data/history");
const MAX_MESSAGES = 30;

// 进程内内存缓存：文件系统不可写（如 Serverless 只读/冷启动）时兜底，
// 保证同一实例内的短期记忆仍可用
const memoryCache = new Map<string, any[]>();

function safeFileName(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safe}.json`;
}

async function readHistory(projectId: string): Promise<any[]> {
  try {
    const filePath = path.join(DATA_DIR, safeFileName(projectId));
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    const list = Array.isArray(parsed) ? parsed : [];
    memoryCache.set(projectId, list);
    return list;
  } catch {
    return memoryCache.get(projectId) || [];
  }
}

/** 加载指定项目的对话历史（最近 MAX_MESSAGES 条） */
export async function loadHistory(projectId: string): Promise<any[]> {
  return readHistory(projectId);
}

/**
 * 追加新消息并落盘，返回追加后的完整历史。
 * 只记录用户消息与有内容的助手消息；按 id 去重。
 */
export async function appendMessages(
  projectId: string,
  newMessages: any[],
): Promise<any[]> {
  if (!Array.isArray(newMessages) || newMessages.length === 0) {
    return readHistory(projectId);
  }

  const history = await readHistory(projectId);
  const seen = new Set(
    history.map((m) => m?.id).filter((id): id is string => !!id),
  );

  for (const msg of newMessages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.id && seen.has(msg.id)) continue;

    const isUser = msg.role === "user";
    const isMeaningfulAssistant =
      msg.role === "assistant" &&
      typeof msg.content === "string" &&
      msg.content.trim().length > 0;

    if (isUser || isMeaningfulAssistant) {
      history.push(msg);
      if (msg.id) seen.add(msg.id);
    }
  }

  const trimmed = history.slice(-MAX_MESSAGES);
  memoryCache.set(projectId, trimmed);

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const targetPath = path.join(DATA_DIR, safeFileName(projectId));
    const tmpPath = `${targetPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(trimmed, null, 2), "utf-8");
    await fs.rename(tmpPath, targetPath);
    console.log(
      `[HistoryStore] Project ${projectId} history: ${trimmed.length} messages`,
    );
  } catch (error) {
    console.warn(
      `[HistoryStore] Failed to persist history for ${projectId}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return trimmed;
}

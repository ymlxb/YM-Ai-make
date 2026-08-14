/**
 * 项目文件存储（服务端记忆）
 *
 * 作用：把每次生成/修改后的最终文件集按 projectId 落盘，
 * 让后续“修改请求”不再依赖前端携带 files，也支持刷新页面后继续修改。
 *
 * 存储位置：server/data/projects/<projectId>.json
 * 写入策略：临时文件 + rename 原子替换，避免半写文件
 */

import * as fs from "fs/promises";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data/projects");

/** 把任意 projectId 转成安全的文件名，防止路径穿越 */
function safeFileName(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safe}.json`;
}

/**
 * 从版本化 threadId 提取基础 projectId。
 * 前端 threadId 形如 "project-xxx-v3"，同一项目所有版本共享同一份“当前文件”记忆。
 */
export function getBaseProjectId(threadId: string): string {
  return threadId.replace(/-v\d+$/, "");
}

/** 保存项目当前文件集（Sandpack 格式 Record<path, code>） */
export async function saveProjectFiles(
  projectId: string,
  files: Record<string, string>,
): Promise<void> {
  if (!files || Object.keys(files).length === 0) return;

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const targetPath = path.join(DATA_DIR, safeFileName(projectId));
    const tmpPath = `${targetPath}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(files, null, 2), "utf-8");
    await fs.rename(tmpPath, targetPath);
    console.log(
      `[ProjectStore] Saved ${Object.keys(files).length} files for project: ${projectId}`,
    );
  } catch (error) {
    console.warn(
      `[ProjectStore] Failed to save project ${projectId}:`,
      error instanceof Error ? error.message : error,
    );
  }
}

/** 加载项目当前文件集；不存在或损坏时返回 null */
export async function loadProjectFiles(
  projectId: string,
): Promise<Record<string, string> | null> {
  try {
    const filePath = path.join(DATA_DIR, safeFileName(projectId));
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

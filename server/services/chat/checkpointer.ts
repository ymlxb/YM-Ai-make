/**
 * 全局共享 Checkpointer
 *
 * 三个流程图（traditional / figma / modification）统一使用同一个实例：
 * - 持久化升级只改这一个文件（MemorySaver → SqliteSaver / PostgresSaver）
 * - 线程状态、清理策略统一管理
 * - 为跨图时间旅行 / 续跑铺路（thread_id 按图命名空间隔离，见 chat.ts）
 */

import { MemorySaver } from "@langchain/langgraph";

export const checkpointer = new MemorySaver();

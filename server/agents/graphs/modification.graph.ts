/**
 * 修改请求流程图
 *
 * 完整 4 节点管线:
 *   用户修改请求 + 当前代码文件
 *      -> [modificationAnalysisNode]   AI：把请求解析成文件级操作计划
 *      -> [modificationLocateNode]     确定性：把计划映射到真实文件并取内容快照
 *      -> [modificationApplyNode]      AI：逐文件整文件重写（并行）
 *      -> [modificationAssembleNode]   确定性：合并修改 + 模板兜底 + 依赖重建 + AST 后处理
 *      -> END
 *
 * 与其它流程的区别:
 *   Traditional: prompt -> 从零规划 -> 逐阶段生成 -> 组装
 *   Figma:       URL -> 设计数据 -> 解析 -> 重构 -> 组装
 *   Modification: 修改请求 + 已有代码 -> 计划 -> 定位 -> 重写 -> 组装
 */

import {
  StateGraph,
  START,
  END,
  MemorySaver,
  Annotation,
} from "@langchain/langgraph";

import { modificationAnalysisNode } from "../flows/modification/nodes/modificationAnalysisNode.js";
import { modificationLocateNode } from "../flows/modification/nodes/modificationLocateNode.js";
import { modificationApplyNode } from "../flows/modification/nodes/modificationApplyNode.js";
import { modificationAssembleNode } from "../flows/modification/nodes/modificationAssembleNode.js";

import type {
  T_ModificationPlan,
  T_ModificationTarget,
  T_ModifiedFile,
} from "../flows/modification/schemas/modificationSchema.js";

const checkpointer = new MemorySaver();

// ==================== Modification 图 State 定义 ====================

const ModificationGraphState = Annotation.Root({
  // ---------- 通用输入 ----------

  /** 聊天历史记录（用于提取最近的修改请求） */
  messages: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  /** 分层 Mock 配置（由路由层解析为扁平 Record） */
  mockConfig: Annotation<Record<string, boolean> | undefined>(),

  /** 当前项目已有代码（Sandpack 格式 Record<path, content>），来自前端 */
  currentFiles: Annotation<Record<string, string>>(),

  // ---------- 修改分析（AI） ----------

  /** 文件级操作计划 */
  modificationPlan: Annotation<T_ModificationPlan | undefined>(),

  // ---------- 目标定位（确定性） ----------

  /** 定位后的目标文件列表（含内容快照） */
  modificationTargets: Annotation<T_ModificationTarget[] | undefined>(),

  // ---------- 修改执行（AI） ----------

  /** 修改后的完整文件列表 */
  updatedFiles: Annotation<T_ModifiedFile[] | undefined>(),

  /** 需要删除的文件路径列表 */
  deletedFiles: Annotation<string[] | undefined>(),

  // ---------- 组装输出 ----------

  /** 最终输出的 Sandpack 文件集 + 变更统计 */
  files: Annotation<
    | {
        files: Record<string, string>;
        stats?: Record<string, unknown>;
      }
    | undefined
  >(),
});

// ==================== 构建 Modification Agent ====================

export function buildModificationAgent() {
  const builder = new StateGraph(ModificationGraphState)
    .addNode("modificationAnalysisNode", modificationAnalysisNode)
    .addNode("modificationLocateNode", modificationLocateNode)
    .addNode("modificationApplyNode", modificationApplyNode)
    .addNode("modificationAssembleNode", modificationAssembleNode)

    .addEdge(START, "modificationAnalysisNode")
    .addEdge("modificationAnalysisNode", "modificationLocateNode")
    .addEdge("modificationLocateNode", "modificationApplyNode")
    .addEdge("modificationApplyNode", "modificationAssembleNode")
    .addEdge("modificationAssembleNode", END);

  return builder.compile({
    checkpointer,
  });
}

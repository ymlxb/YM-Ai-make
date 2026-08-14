/**
 * 修改请求流程 - Schema 定义
 *
 * 覆盖三个阶段：
 * 1. 修改分析（AI）：把自然语言修改请求解析成“文件级操作计划”
 * 2. 目标定位（确定性）：把计划中的文件路径映射到当前代码里的真实文件
 * 3. 修改执行（AI）：逐文件重写完整代码
 */

import { z } from "zod";

// ==================== Step 1: 修改分析（AI） ====================

/** 单个文件级操作 */
export const ModificationOperationSchema = z.object({
  /** 操作类型：修改已有文件 / 新建文件 / 删除文件 */
  action: z
    .enum(["edit", "create", "delete"])
    .describe("操作类型：edit=修改已有文件，create=新建文件，delete=删除文件"),
  /** 目标文件路径，如 /App.tsx 或 /components/HeroSection.tsx */
  filePath: z
    .string()
    .describe("目标文件路径（必须以 / 开头，且必须在提供的文件清单范围内）"),
  /** 为什么需要对该文件执行此操作 */
  reason: z.string().describe("为什么需要对该文件执行此操作"),
});

/** 修改计划：一次修改请求的完整解析结果 */
export const ModificationPlanSchema = z.object({
  /** 对本次修改请求的一句话总结 */
  summary: z.string().describe("对本次修改请求的一句话总结"),
  /** 需要执行的文件级操作列表 */
  operations: z
    .array(ModificationOperationSchema)
    .describe("需要执行的文件级操作列表，数量保持精简（通常 1-5 个）"),
  /** 本次修改需要新增的 npm 依赖包名（若没有则为空数组） */
  newDependencies: z
    .array(z.string())
    .optional()
    .describe("本次修改需要新增的 npm 依赖包名，如 lucide-react"),
});

// ==================== Step 2: 目标定位（确定性） ====================

/** 定位后的单个目标文件（含当前内容快照） */
export const ModificationTargetSchema = z.object({
  action: z.enum(["edit", "create", "delete"]),
  filePath: z.string(),
  reason: z.string(),
  /** 当前文件内容；create 时为 null，delete 时忽略 */
  currentContent: z
    .string()
    .nullable()
    .describe("当前文件内容；新建时为 null"),
  /** 该文件当前是否已存在 */
  exists: z.boolean().describe("该文件当前是否已存在于项目中"),
});

// ==================== Step 3: 修改执行（AI） ====================

/** 修改后的单个文件（完整内容） */
export const ModifiedFileSchema = z.object({
  filePath: z.string(),
  /** 修改后的完整文件内容；delete 操作不产出内容 */
  content: z
    .string()
    .nullable()
    .describe("修改后的完整文件内容（整文件重写），delete 时为 null"),
});

export type T_ModificationPlan = z.infer<typeof ModificationPlanSchema>;
export type T_ModificationOperation = z.infer<
  typeof ModificationOperationSchema
>;
export type T_ModificationTarget = z.infer<typeof ModificationTargetSchema>;
export type T_ModifiedFile = z.infer<typeof ModifiedFileSchema>;

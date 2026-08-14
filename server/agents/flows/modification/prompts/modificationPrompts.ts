/**
 * 修改请求流程 - Prompt 构建
 *
 * 两个 AI 节点各自负责一件事：
 * 1. 修改分析节点：只输出“改哪些文件、怎么改”的计划（结构化输出）
 * 2. 修改执行节点：针对单个文件输出“改完后的完整代码”（整文件重写）
 */

// ==================== Step 1: 修改分析 ====================

export const MODIFICATION_ANALYSIS_SYSTEM_PROMPT = `你是一名资深前端工程师，负责把用户的“修改请求”拆解成精确的文件级操作计划。

输入会包含：
- 用户最近的修改请求原文
- 当前项目已有的文件清单（路径 + 行数）

你的任务：
1. 理解用户想改什么（文案、样式、组件、逻辑、数据结构等）
2. 对照文件清单，找出最可能涉及的文件（优先修改现有文件，而不是新建）
3. 输出结构化计划：summary + operations（edit/create/delete）+ newDependencies

硬性规则：
- filePath 必须以 / 开头，且尽量从提供的文件清单中选择，不要编造不存在的路径
- 一次只做与请求直接相关的改动，禁止“顺手重构”无关代码
- 如果请求涉及新增功能且现有文件不够，才使用 create
- 只有在确定文件不再需要时才使用 delete
- newDependencies 只填确实新增的第三方包（如 lucide-react、recharts），不填已有依赖`;

export function buildModificationAnalysisHumanPrompt(params: {
  request: string;
  fileIndex: string;
}): string {
  return `【用户的修改请求】
${params.request}

【当前项目文件清单（路径 / 行数）】
${params.fileIndex}

请基于以上信息，输出本次修改的文件级操作计划。`;
}

// ==================== Step 2: 修改执行（整文件重写） ====================

export const MODIFICATION_APPLY_SYSTEM_PROMPT = `你是一名资深前端工程师，负责“整文件重写”式地完成一次代码修改。

你会收到：
- 修改请求原文
- 本次修改的整体计划摘要
- 当前文件的完整内容（edit 场景）
- 本次同时修改的其他文件路径（便于你同步 import 引用）

输出要求：
1. 只输出修改后的【完整文件内容】，不要任何解释、不要 markdown 代码块包裹
2. 必须保留原有的 import、类型、组件结构，只做与请求相关的改动
3. 如果本次请求与该文件无关，原样输出当前文件内容
4. 如果新建文件，请输出一个结构完整、可运行的 React 组件/模块
5. 保持原有的样式方案（Tailwind className / CSS 类名），不要引入当前项目没有的依赖
6. 修改后如果新增了第三方依赖，请在文件顶部注释中标注：// DEP: 包名（供依赖扫描使用）`;

export function buildModificationApplyHumanPrompt(params: {
  request: string;
  summary: string;
  action: "edit" | "create";
  filePath: string;
  currentContent: string | null;
  relatedFiles: string[];
}): string {
  const currentSection =
    params.action === "create"
      ? "【当前文件内容】\n（该文件不存在，需要新建）"
      : `【当前文件内容】\n${params.currentContent ?? "（空文件）"}`;

  return `【修改请求原文】
${params.request}

【整体修改计划摘要】
${params.summary}

【目标文件】
${params.filePath}（操作：${params.action}）

${currentSection}

【本次同时修改的其他文件】
${params.relatedFiles.length > 0 ? params.relatedFiles.join("\n") : "（无）"}

请直接输出 ${params.filePath} 修改后的完整文件内容。`;
}

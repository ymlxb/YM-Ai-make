/**
 * Figma 直连流程 - 设计结构 → TSX 代码生成 Prompt
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export interface FigmaCodegenParams {
  /** 压缩后的设计结构 JSON 字符串 */
  designContext: string;
  /** 图片资源映射（varName → url） */
  imageAssets: Array<{ id: string; varName: string; url: string }>;
  /** 设计变量（颜色令牌）JSON 字符串，可为空 */
  designTokens?: string;
  /** 用户补充说明，可为空 */
  userNote?: string;
}

export function buildFigmaCodegenSystemPrompt(): string {
  return `你是一名资深前端工程师，负责把 Figma 设计稿的 JSON 结构转换为单个 React TypeScript (TSX) 组件文件。
你只输出代码本身：不要输出 markdown 代码块标记，不要输出任何解释或注释性文字。`;
}

export function buildFigmaCodegenHumanPrompt(
  params: FigmaCodegenParams,
): string {
  const imageBlock =
    params.imageAssets.length > 0
      ? params.imageAssets
          .map((a) => `${a.varName} -> ${a.url}`)
          .join("\n")
      : "（无）";

  return `请根据下面的 Figma 设计结构生成一个完整的单文件 TSX 组件。

## 输出要求（必须严格遵守）
1. 文件顶部先定义图片资源常量，每张图一行：const img0 = "https://...";
2. 可把重复出现的区域抽成辅助组件（首字母大写的函数组件，如 function Card(...) 或 const Card = () => ...），放在主组件之前；不要抽得过度，也不要遗漏。
3. 最后必须 export default function App()，return 一个容器 div，宽度/高度使用设计稿画布尺寸，整体用 flex 或相对布局还原设计。
4. 每个主要区块容器加 data-node-id="<id>" 与 data-name="<名称>" 属性（值来自设计结构的 id/name）。
5. 样式全部使用内联 style={{ ... }}，数值为像素数字，例如 width: 100, height: 40, top: 10, left: 20, backgroundColor: "rgb(...)", borderRadius: 8, fontSize: 14, fontWeight: 600, gap: 12, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between"。
6. 图片一律使用顶部 img 常量：<img src={img0} style={{ width: ..., height: ..., objectFit: "cover", borderRadius: ... }} alt="..." />。
7. 文本严格保留设计稿原文（含中文），不要翻译、不要编造。
8. 颜色使用 fills 提供的色值；渐变或图片填充的节点用图片常量或背景色近似还原。
9. 代码必须是合法 TSX，能被 Babel 的 typescript + jsx 插件直接解析；不要 import 任何第三方库（React 由模板提供）。

## 设计结构（JSON）
${params.designContext}

## 图片资源（varName -> url）
${imageBlock}

## 设计变量（颜色令牌）
${params.designTokens || "（无）"}

## 用户补充说明
${params.userNote || "（无，完全按设计稿生成）"}`;
}

export function buildFigmaCodegenMessages(
  params: FigmaCodegenParams,
): [SystemMessage, HumanMessage] {
  return [
    new SystemMessage(buildFigmaCodegenSystemPrompt()),
    new HumanMessage(buildFigmaCodegenHumanPrompt(params)),
  ];
}

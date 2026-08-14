/**
 * 路由层适配器共享工具函数
 */

export function getLastMessage(messages: any[]): any {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  return messages[messages.length - 1];
}

export function getLastText(messages: any[]): string {
  const lastMsg = getLastMessage(messages);
  return typeof lastMsg?.content === "string" ? lastMsg.content : "";
}

export function hasImageAttachment(messages: any[]): boolean {
  const lastMsg = getLastMessage(messages);
  const attachments = Array.isArray(lastMsg?.attachments)
    ? lastMsg.attachments
    : [];
  return attachments.some((att: any) => att.type === "image" && att.url);
}

/**
 * 判断当前是否有“已有代码”可供修改。
 * 修改请求必须基于已生成的代码，否则没有可修改的对象，应回退到普通生成流程。
 */
export function hasExistingFiles(files?: Record<string, string>): boolean {
  return !!files && Object.keys(files).length > 0;
}

/**
 * 避免“只发了链接”被误判为普通文本 prompt；只有去掉链接后仍有文字内容，才算 prompt 请求。
 * @param messages 
 * @returns 
 */
// 判断最后一条消息是否包含文本提示（去除URL链接后）
export function hasTextPrompt(messages: any[]): boolean {
  // 取最后一条消息文本
  const content = getLastText(messages);
  // 去除URL链接后的文本长度
  const textWithoutUrls = content.replace(/https?:\/\/\S+/g, "").trim();
  // 如果去除URL后的文本长度大于0，说明有文本提示
  return textWithoutUrls.length > 0;
}

export function isModificationRequest(messages: any[]): boolean {
  const content = getLastText(messages).toLowerCase();
  if (!content) return false;
  const keywords = [
    // English
    "modify",
    "update",
    "refactor",
    "change",
    "add a",
    "add an",
    "remove",
    "delete",
    "make the",
    // 中文：明确的修改语义
    "修改",
    "改一下",
    "改一改",
    "帮我改",
    "给我改",
    "改成",
    "换成",
    "调整为",
    "调整",
    "优化",
    "重构",
    "在现有",
    "基于当前",
    // 中文：增删类修改
    "加一个",
    "加个",
    "添加",
    "增加",
    "新增",
    "去掉",
    "移除",
    "删除",
    "删掉",
    // 中文：多轮对话中的继续修改
    "继续",
    "接着",
    "再帮",
  ];
  return keywords.some((k) => content.includes(k));
}

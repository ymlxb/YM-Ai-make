/**
 * 运行取消注册表
 *
 * 以 threadId 为键登记正在运行的 Agent 任务，让“停止生成”可以随时中断：
 * - 注册：每个请求开始流式生成前登记一个 AbortController
 * - 停止：/api/chat/stop 或客户端断连时 abort()，LangGraph 收到 signal 后取消运行
 * - 注销：请求结束（正常 / 异常 / 被中断）后移除登记
 */

const activeRuns = new Map<string, AbortController>();

export function registerRun(threadId: string): AbortController {
  const controller = new AbortController();
  activeRuns.set(threadId, controller);
  return controller;
}

/** 请求停止指定 threadId 的运行；返回是否确实存在该运行 */
export function stopRun(threadId: string): boolean {
  const controller = activeRuns.get(threadId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function isRunStopped(threadId: string): boolean {
  return activeRuns.get(threadId)?.signal.aborted ?? false;
}

export function unregisterRun(threadId: string): void {
  activeRuns.delete(threadId);
}

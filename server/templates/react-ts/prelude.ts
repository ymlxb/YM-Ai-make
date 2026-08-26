// @ts-nocheck
// 全局错误可见化：必须在业务代码加载前注册（由 index.tsx 第一个 import）
// 这样即使 App 及其依赖在模块加载阶段抛错，也能显示红字而不是白屏。

function escapeHtml(value: string): string {
  return value
    // 注意：不要写成字面 "&amp;" 等，前端 sandpackStore 会做 HTML 实体解码，
    // 把 "&quot;" 变成裸引号导致字符串被截断；用拼接避免被误解码。
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

function showFatalError(message: string, detail?: string) {
  const existing = document.getElementById("__fatal_error__");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.id = "__fatal_error__";
  div.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#ffffff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;";
  div.innerHTML = `
    <div style="max-width:680px;width:100%;max-height:90vh;overflow:auto;border:1px solid #fecaca;border-radius:12px;background:#fef2f2;padding:20px;color:#7f1d1d;">
      <h2 style="margin:0 0 8px;font-size:16px;font-weight:600;">运行时错误（已捕获）</h2>
      <pre style="white-space:pre-wrap;word-break:break-all;margin:0;font-size:12px;line-height:1.6;color:#b91c1c;">${escapeHtml(
        message,
      )}</pre>
      ${
        detail
          ? `<pre style="white-space:pre-wrap;word-break:break-all;margin:8px 0 0;font-size:11px;line-height:1.5;color:#991b1b;">${escapeHtml(
              detail,
            )}</pre>`
          : ""
      }
    </div>`;
  document.body.appendChild(div);
}

window.addEventListener("error", (event) => {
  const message = event.error?.message || event.message || "未知错误";
  showFatalError(message, event.error?.stack || "");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason?.message || String(reason || "未处理的 Promise 错误");
  showFatalError(message, reason?.stack || "");
});

export {};

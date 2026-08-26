// @ts-nocheck
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// ==================== 全局错误可见化 ====================
// 捕获模块加载阶段/事件回调里的未捕获错误，避免白屏无法排查
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const error: Error = this.state.error;
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="w-full max-w-lg space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h1 className="text-center text-xl font-semibold text-gray-900">
              应用出错了
            </h1>
            <pre className="max-h-48 overflow-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
              {error?.message || "未知错误"}
              {error?.stack ? `\n\n${error.stack}` : ""}
            </pre>
            <p className="text-center text-sm text-gray-500">
              以上是具体的错误信息，请将其反馈给开发者
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                刷新页面
              </button>
              <a
                href="#/"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                返回首页
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

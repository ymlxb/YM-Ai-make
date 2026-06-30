"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import {
  Code2,
  Eye,
  Github,
  LayoutDashboard,
  LogOut,
  MonitorUp,
  Settings,
  Sparkles,
  Zap,
} from "lucide-react";
import { ChatPanel } from "./ChatPanel";
import { PreviewPanel } from "./PreviewPanel";
import { useSandpackStore } from "@/store/sandpackStore";
import { useChatStore } from "@/store/chatStore";
import type { LayoutMode, AppShellProps } from "@/types/components";

export function AppShell({ children }: AppShellProps) {
  const { viewMode, setViewMode } = useSandpackStore();
  const { versions, isLoading, projectName } = useChatStore();
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const latestVersion = versions.at(-1);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#f5f7fb] text-[#172033]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#dfe5ef] bg-white/90 px-5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#dfe5ef] bg-white shadow-sm">
              <Image
                src="/logo.svg"
                alt="YM AI Make"
                fill
                priority
                className="object-contain p-1.5"
                sizes="40px"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold tracking-[0] text-[#111827]">
                  YM AI Make
                </h1>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  在线演示
                </span>
              </div>
              <p className="truncate text-xs text-[#68758a]">
                用自然语言和设计素材生成 React + TypeScript 应用
              </p>
            </div>
          </div>

          <div className="hidden h-8 items-center gap-2 rounded-lg border border-[#dfe5ef] bg-[#f8fafc] px-3 text-xs text-[#536277] lg:flex">
            <Sparkles className="h-3.5 w-3.5 text-[#2563eb]" />
            <span className="max-w-[260px] truncate">
              {projectName || "Untitled project"}
            </span>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-xl border border-[#dfe5ef] bg-[#f1f5f9] p-1 shadow-inner md:flex">
          <button
            type="button"
            onClick={() => setViewMode("preview")}
            className={`flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
              viewMode === "preview"
                ? "bg-white text-[#111827] shadow-sm"
                : "text-[#64748b] hover:text-[#1f2937]"
            }`}
          >
            <Eye size={16} />
            预览
          </button>
          <button
            type="button"
            onClick={() => setViewMode("code")}
            className={`flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
              viewMode === "code"
                ? "bg-white text-[#111827] shadow-sm"
                : "text-[#64748b] hover:text-[#1f2937]"
            }`}
          >
            <Code2 size={16} />
            代码
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-xs text-[#64748b] xl:flex">
            <StatusPill
              label={isLoading ? "生成中" : "就绪"}
              tone={isLoading ? "active" : "idle"}
            />
            <span className="rounded-full border border-[#dfe5ef] bg-white px-2.5 py-1">
              {versions.length || 0} 个版本
            </span>
            {latestVersion && (
              <span className="rounded-full border border-[#dfe5ef] bg-white px-2.5 py-1">
                {latestVersion.fileCount} 个文件
              </span>
            )}
          </div>

          <a
            href="https://github.com/ymlxb/YM-Ai-make"
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 items-center gap-2 rounded-lg border border-[#dfe5ef] bg-white px-3 text-xs font-medium text-[#334155] shadow-sm transition hover:border-[#cbd5e1] hover:bg-[#f8fafc] lg:flex"
          >
            <Github className="h-4 w-4" />
            源码
          </a>

          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen((open) => !open)}
              className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[#dfe5ef] bg-white shadow-sm transition hover:shadow-md"
              aria-label="Open account menu"
            >
              <Image
                src="/avatar.gif"
                alt="Demo user"
                fill
                unoptimized
                className="object-cover"
                sizes="36px"
              />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-[#dfe5ef] bg-white p-1.5 shadow-xl ring-1 ring-black/5">
                <MenuButton icon={<LayoutDashboard size={16} />}>
                  演示工作区
                </MenuButton>
                <MenuButton icon={<Settings size={16} />}>设置</MenuButton>
                <MenuButton icon={<LogOut size={16} />} danger>
                  退出演示
                </MenuButton>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-[minmax(360px,420px)_minmax(0,1fr)] gap-4 overflow-hidden p-4 max-md:grid-cols-1">
        <aside
          className={`min-h-0 overflow-hidden rounded-2xl border border-[#dfe5ef] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition-all duration-300 max-md:min-h-[46vh] ${
            layoutMode === "preview-only"
              ? "w-0 border-0 opacity-0 max-md:hidden"
              : "opacity-100"
          }`}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[#e5eaf2] bg-[#fbfdff] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase text-[#64748b]">
                    生成提示词
                  </p>
                  <h2 className="mt-0.5 text-base font-semibold text-[#111827]">
                    描述你想要的应用
                  </h2>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eaf2ff] text-[#2563eb]">
                  <Zap className="h-4 w-4" />
                </div>
              </div>
            </div>
            <ChatPanel />
          </div>
        </aside>

        <section className="min-h-0 overflow-hidden rounded-2xl border border-[#dfe5ef] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
          <div className="flex h-11 items-center justify-between border-b border-[#e5eaf2] bg-[#fbfdff] px-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#334155]">
              <MonitorUp className="h-4 w-4 text-[#2563eb]" />
              实时预览环境
            </div>
            <div className="flex items-center gap-1.5 md:hidden">
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                className={`rounded-md px-2 py-1 text-xs ${
                  viewMode === "preview"
                    ? "bg-[#eaf2ff] text-[#1d4ed8]"
                    : "text-[#64748b]"
                }`}
              >
                预览
              </button>
              <button
                type="button"
                onClick={() => setViewMode("code")}
                className={`rounded-md px-2 py-1 text-xs ${
                  viewMode === "code"
                    ? "bg-[#eaf2ff] text-[#1d4ed8]"
                    : "text-[#64748b]"
                }`}
              >
                代码
              </button>
            </div>
          </div>
          <div className="h-[calc(100%-44px)]">
            <PreviewPanel
              layoutMode={layoutMode}
              onExitFullScreen={() => setLayoutMode("split")}
              onEnterFullScreen={() => setLayoutMode("preview-only")}
            >
              {children}
            </PreviewPanel>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "idle";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe5ef] bg-white px-2.5 py-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          tone === "active" ? "animate-pulse bg-[#2563eb]" : "bg-emerald-500"
        }`}
      />
      {label}
    </span>
  );
}

function MenuButton({
  children,
  icon,
  danger = false,
}: {
  children: ReactNode;
  icon: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
        danger
          ? "text-red-600 hover:bg-red-50"
          : "text-[#334155] hover:bg-[#f1f5f9]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

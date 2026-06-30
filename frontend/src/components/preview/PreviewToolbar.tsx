"use client";

import { useState } from "react";
import { Download, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { useSandpackStore } from "@/store/sandpackStore";
import { downloadGeneratedCode } from "@/lib/downloadCode";
import type { PreviewToolbarProps } from "@/types/components";

export function PreviewToolbar({
  isFullScreen,
  onEnterFullScreen,
  onExitFullScreen,
}: PreviewToolbarProps) {
  const { generatedFiles, viewMode } = useSandpackStore();
  const [isDownloading, setIsDownloading] = useState(false);
  const templateFiles =
    typeof window !== "undefined" ? window.__templateFiles || {} : {};
  const hasDownloadableFiles =
    generatedFiles || Object.keys(templateFiles).length > 0;

  const handleDownload = async () => {
    if (!hasDownloadableFiles) {
      toast.error("代码仍在加载中。");
      return;
    }

    setIsDownloading(true);
    try {
      await downloadGeneratedCode(generatedFiles || templateFiles, templateFiles);
      toast.success("项目已下载。");
    } catch (error) {
      console.error("下载失败:", error);
      toast.error("下载失败，请重试。");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#dfe5ef] bg-white/95 p-1 shadow-lg backdrop-blur">
      {viewMode === "code" && (
        <button
          type="button"
          onClick={handleDownload}
          disabled={!hasDownloadableFiles || isDownloading}
          className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-[#334155] transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-50"
          title="下载项目"
        >
          <Download className="h-4 w-4" />
          {isDownloading ? "导出中" : "导出"}
        </button>
      )}

      <button
        type="button"
        onClick={isFullScreen ? onExitFullScreen : onEnterFullScreen}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#334155] transition hover:bg-[#f1f5f9]"
        title={isFullScreen ? "退出专注模式" : "专注预览"}
        aria-label={isFullScreen ? "退出专注模式" : "专注预览"}
      >
        {isFullScreen ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

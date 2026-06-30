"use client";

import { PreviewToolbar } from "@/components/preview/PreviewToolbar";
import type { PreviewPanelProps } from "@/types/components";

export function PreviewPanel({
  children,
  layoutMode,
  onEnterFullScreen,
  onExitFullScreen,
}: PreviewPanelProps) {
  const isFullScreen = layoutMode === "preview-only";

  return (
    <section className="relative h-full w-full overflow-hidden bg-white">
      <div className="absolute right-3 top-3 z-20">
        <PreviewToolbar
          isFullScreen={isFullScreen}
          onEnterFullScreen={onEnterFullScreen}
          onExitFullScreen={onExitFullScreen}
        />
      </div>
      <div className="h-full w-full overflow-hidden bg-white">{children}</div>
    </section>
  );
}

"use client";

import { Bubble, Sender } from "@ant-design/x";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  FileCode2,
  ImagePlus,
  Layers3,
  Lightbulb,
  Paperclip,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useChatStore } from "@/store/chatStore";
import { IMG_UPLOAD_URL } from "@/constants/config";
import { ThoughtChain } from "./ThoughtChain";
import { VersionCard } from "./VersionCard";

type AttachedFile = {
  id: string;
  url: string;
  name: string;
  type: "image" | "design";
};

const examplePrompts = [
  "生成一个 SaaS 数据看板，包含图表、筛选器、侧边栏和指标卡片。",
  "做一个移动端旅行规划应用，包含行程卡片、预算统计和目的地推荐。",
  "生成一个 AI 简历优化工具的官网首页，风格专业、现代、有转化按钮。",
];

export function ChatPanel() {
  const { messages, isLoading, sendMessage, stopGeneration } = useChat();
  const messageThoughts = useChatStore((state) => state.messageThoughts);
  const versions = useChatStore((state) => state.versions);
  const projectName = useChatStore((state) => state.projectName);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"info" | "warning" | "error">(
    "info",
  );
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading, attachedFiles]);

  const showToast = (
    message: string,
    type: "info" | "warning" | "error" = "info",
  ) => {
    setToastMessage(message);
    setToastType(type);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    event.target.value = "";

    const ext = file.name.toLowerCase().split(".").pop() || "";
    const isDesignFile = ["fig", "sketch", "xd", "psd"].includes(ext);
    const hasDesignFile = attachedFiles.some((item) => item.type === "design");
    const hasImageFile = attachedFiles.some((item) => item.type === "image");

    if (isDesignFile && hasImageFile) {
      showToast("请使用 1 个设计文件，或最多 3 张图片，不要混合上传。", "warning");
      return;
    }

    if (!isDesignFile && hasDesignFile) {
      showToast("请先移除设计文件，再添加图片参考。", "warning");
      return;
    }

    if (isDesignFile && hasDesignFile) {
      showToast("最多只能上传 1 个设计文件。", "warning");
      return;
    }

    if (!isDesignFile && attachedFiles.length >= 3) {
      showToast("最多只能上传 3 张图片。", "warning");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(IMG_UPLOAD_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setAttachedFiles((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          url: data.url,
          name: file.name,
          type: isDesignFile ? "design" : "image",
        },
      ]);
    } catch (error) {
      console.error("Upload error:", error);
      showToast("上传失败，请重试。", "error");
    } finally {
      setIsUploading(false);
    }
  };

  const submitPrompt = (value: string) => {
    // 任务运行中不允许发送新消息，避免打断正在进行的生成
    if (isLoading) {
      showToast("当前有任务正在生成，请先停止或等待完成。", "warning");
      return;
    }

    if (!value.trim() && attachedFiles.length === 0) return;

    const attachments = attachedFiles.map((file) => ({
      type: "image" as const,
      url: file.url,
    }));

    sendMessage(value || "请根据上传的参考素材生成应用。", attachments);
    setAttachedFiles([]);
    setInputValue("");
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white">
      {toastMessage && (
        <div className="absolute left-1/2 top-4 z-50 -translate-x-1/2">
          <div
            className={`rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
              toastType === "warning"
                ? "bg-amber-500"
                : toastType === "error"
                  ? "bg-red-500"
                  : "bg-[#172033]"
            }`}
          >
            {toastMessage}
          </div>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-h-full max-w-full"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 rounded-full p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Close image preview"
            >
              <X size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="附件预览"
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept="image/*,.fig,.sketch,.xd,.psd"
        onChange={handleFileSelect}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <EmptyState
            onSelectPrompt={(prompt) => {
              setInputValue(prompt);
            }}
          />
        ) : (
          messages.map((message) => (
            <div key={message.id} className="mb-4">
              {(message.content || message.attachments?.length) && (
                <Bubble.List
                  items={[
                    {
                      key: message.id,
                      role: message.role === "user" ? "user" : "model",
                      placement: message.role === "user" ? "end" : "start",
                      content: (
                        <div className="flex max-w-full flex-col gap-2">
                          {message.attachments?.map((attachment) => (
                            <AttachmentPreview
                              key={attachment.url}
                              url={attachment.url}
                              onPreview={setPreviewImage}
                            />
                          ))}
                          <div className="whitespace-pre-wrap text-sm leading-6">
                            {message.content}
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
              )}

              {message.role === "assistant" &&
                messageThoughts[message.id]?.length > 0 && (
                  <div className="mt-2 flex justify-start pl-2">
                    <ThoughtChain thoughts={messageThoughts[message.id]} />
                  </div>
                )}

              {message.role === "assistant" &&
                (() => {
                  const assistantMessages = messages.filter(
                    (item) => item.role === "assistant",
                  );
                  const messageIndex = assistantMessages.findIndex(
                    (item) => item.id === message.id,
                  );
                  const version = versions[messageIndex];

                  if (!version) return null;
                  return (
                    <div className="mt-2 w-full px-2">
                      <VersionCard version={version} projectName={projectName} />
                    </div>
                  );
                })()}
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-[#e5eaf2] bg-[#fbfdff] p-3">
        {isLoading && (
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={stopGeneration}
              className="flex items-center gap-1.5 rounded-full border border-[#e5eaf2] bg-white px-3 py-1.5 text-xs font-medium text-[#64748b] shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              title="停止当前生成"
            >
              <Square className="h-3 w-3 fill-current" />
              停止生成
            </button>
          </div>
        )}

        {attachedFiles.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto px-1">
            {attachedFiles.map((file) => (
              <div key={file.id} className="group relative shrink-0">
                {file.type === "image" ? (
                  <Image
                    src={file.url}
                    alt={file.name}
                    width={64}
                    height={64}
                    className="h-16 w-16 cursor-zoom-in rounded-lg border border-[#dfe5ef] object-cover"
                    unoptimized
                    onClick={() => setPreviewImage(file.url)}
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-[#bfdbfe] bg-[#eaf2ff] text-xs font-bold text-[#1d4ed8]">
                    {file.name.split(".").pop()?.toUpperCase() || "FILE"}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setAttachedFiles((current) =>
                      current.filter((item) => item.id !== file.id),
                    )
                  }
                  className="absolute -right-1 -top-1 rounded-full bg-[#111827] p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove attachment"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <Sender
          value={inputValue}
          onChange={setInputValue}
          disabled={isLoading}
          prefix={
            <button
              type="button"
              className="rounded-lg p-1 text-[#64748b] transition hover:bg-[#eef2f7] hover:text-[#1f2937]"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
                  title="上传图片或设计文件"
            >
              {isUploading ? (
                <span className="block h-4 w-4 animate-spin rounded-full border-2 border-[#94a3b8] border-t-transparent" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>
          }
          placeholder="描述一个看板、官网、移动应用，或粘贴 Figma 链接..."
          loading={isLoading}
          onSubmit={submitPrompt}
        />
      </div>
    </div>
  );
}

function EmptyState({
  onSelectPrompt,
}: {
  onSelectPrompt: (prompt: string) => void;
}) {
  return (
    <div className="flex min-h-full flex-col justify-between gap-6 py-2">
      <div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#bfdbfe] bg-[#eaf2ff] px-3 py-1 text-xs font-medium text-[#1d4ed8]">
          <Sparkles className="h-3.5 w-3.5" />
          作品演示已就绪
        </div>
        <h3 className="text-2xl font-semibold tracking-[0] text-[#111827]">
          用一句话生成一个 React 应用。
        </h3>
        <p className="mt-3 text-sm leading-6 text-[#64748b]">
          描述你想做的产品，也可以上传截图或粘贴 Figma 链接。系统会展示生成思路、
          组装项目文件，并在右侧打开实时预览。
        </p>
      </div>

      <div className="grid gap-3">
        <Capability
          icon={<Lightbulb className="h-4 w-4" />}
          title="从需求到产品"
          description="自动分析意图、规划应用结构，并生成 UI 与业务代码。"
        />
        <Capability
          icon={<ImagePlus className="h-4 w-4" />}
          title="支持视觉参考"
          description="可以上传截图或设计文件，让生成结果更贴近目标界面。"
        />
        <Capability
          icon={<FileCode2 className="h-4 w-4" />}
          title="可预览可导出"
          description="右侧实时查看效果，切换代码视图后可以下载完整项目。"
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase text-[#64748b]">
          试试这些示例
        </p>
        <div className="space-y-2">
          {examplePrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onSelectPrompt(prompt)}
              className="w-full rounded-xl border border-[#dfe5ef] bg-white px-3 py-2.5 text-left text-sm leading-5 text-[#334155] transition hover:border-[#bfdbfe] hover:bg-[#f8fbff]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Capability({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-xl border border-[#e5eaf2] bg-[#fbfdff] p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#2563eb] shadow-sm">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-[#111827]">{title}</div>
        <div className="mt-0.5 text-xs leading-5 text-[#64748b]">
          {description}
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({
  url,
  onPreview,
}: {
  url: string;
  onPreview: (url: string) => void;
}) {
  const isDesignFile = url.includes("/designs/");

  if (isDesignFile) {
    const fileName = decodeURIComponent(url.split("/").pop() || "design file");
    return (
      <div className="max-w-[300px] rounded-xl border border-[#dfe5ef] bg-[#f8fafc] p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eaf2ff] text-[#1d4ed8]">
            <Layers3 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[#111827]">
              {fileName}
            </div>
            <div className="text-xs text-[#64748b]">设计参考文件</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="max-w-[300px] overflow-hidden rounded-xl border border-[#dfe5ef] transition hover:opacity-90"
      onClick={() => onPreview(url)}
    >
      <Image
        src={url}
        alt="附件"
        width={300}
        height={180}
        className="h-auto w-full object-cover"
        unoptimized
      />
    </button>
  );
}

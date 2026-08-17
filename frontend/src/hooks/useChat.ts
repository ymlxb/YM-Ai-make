// 聊天相关自定义 Hook
"use client";

import { useCallback, useRef } from "react";
import { ChatMessage } from "@/types/message";
import { generateAppStream, stopChatStream } from "@/services/api";
import { useChatStore } from "@/store/chatStore";
import { useSandpackStore } from "@/store/sandpackStore";
import { StreamEventType } from "@/types/api";
import type { FlowType } from "@/types/flow";
import { isFigmaUrl } from "@/types/flow";
import {
  FLOW_CONFIG,
  NEXT_STEP_MAP,
  STEP_DEFINITIONS,
  getPhaseByNode,
} from "@/constants/chat";

/**
 * useChat
 *
 * Chat 领域唯一入口
 * - 管理消息状态
 * - 触发生成
 * - 维护 loading / streaming
 * - 接收 files 事件并更新 Sandpack
 */
export function useChat() {
  // 当前生成任务的 AbortController，用于“停止生成”
  const abortRef = useRef<AbortController | null>(null);

  const {
    messages,
    isLoading,
    addMessage,
    updateMessageContent,
    setLoading,
    addThought,
    updateThought,
    archiveThoughts,
    updatePhaseProgress,
    collapsePhase,
    updateProjectName, // 获取更新项目名称的方法
    incrementVersion, // 递增版本号
    getCurrentThreadId, // 获取当前版本的 threadId
    saveVersion, // 保存版本快照
    setCurrentFlow, // 设置当前流程类型
  } = useChatStore();

  const { setGeneratedFiles, setIsAssembling } = useSandpackStore();

  const getThoughtDetails = (
    type: StreamEventType,
    status: "pending" | "success" | "error",
    data?: unknown,
  ) => {
    const config = STEP_DEFINITIONS[type];

    if (!config) {
      return {
        title: "处理中",
        description: "AI 正在思考...",
      };
    }

    let descriptionStr = "";
    if (status === "pending") {
      descriptionStr = config.description.pending;
    } else {
      const successDesc = config.description.success;
      descriptionStr =
        typeof successDesc === "function" ? successDesc(data) : successDesc;
    }

    return {
      title: config.title,
      description: descriptionStr,
    };
  };

  /**
   * 发送用户消息，并触发 AI 生成
   */
  const sendMessage = useCallback(
    async (content: string, attachments?: { type: "image"; url: string }[]) => {
      // Guard: 防止重复提交
      if (useChatStore.getState().isLoading) return;

      // 版本管理：判断是创建还是编辑
      const isEditing = messages.some((m) => m.role === "assistant");
      const operation: "create" | "edit" = isEditing ? "edit" : "create";

      // 修改请求识别：已有生成代码 + 编辑操作 -> modification 流程
      const sandpackFiles = useSandpackStore.getState().generatedFiles;
      const hasExistingFiles =
        !!sandpackFiles && Object.keys(sandpackFiles).length > 0;

      // 递增版本号
      const newVersion = incrementVersion();
      const threadId = getCurrentThreadId();

      console.log(
        `[useChat] ${operation === "create" ? "Creating" : "Editing"} project:`,
        {
          version: newVersion,
          threadId,
          operation,
        },
      );

      // 1. 构造并添加用户消息
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        attachments,
      };

      addMessage(userMessage);

      // 2. 初始化状态
      setLoading(true);

      // ✨ 归档上一次的思维链（找到最后一个 assistant 消息）
      const previousMessages = useChatStore.getState().messages;
      const lastAssistantMsg = [...previousMessages]
        .reverse()
        .find((m) => m.role === "assistant");
      if (lastAssistantMsg) {
        archiveThoughts(lastAssistantMsg.id);
      }

      // ✨ 立即创建一个 assistant 消息来承载思维链
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "", // 内容后续通过 streaming 填充
      };
      const assistantId = assistantMessage.id; // ✨ 保存 ID 用于后续操作
      addMessage(assistantMessage);

      // ✨ 流程类型识别：Figma 链接 > 已有代码上的修改请求 > 从零生成
      const flowType: FlowType = isFigmaUrl(content)
        ? "figma"
        : hasExistingFiles && operation === "edit"
          ? "modification"
          : "traditional";
      setCurrentFlow(flowType);

      // ✨ 使用流程配置的初始步骤
      const initialType = FLOW_CONFIG[flowType].initialStep;

      console.log(`[useChat] Flow: ${flowType}, Initial Step: ${initialType}`);

      const initialDetails = getThoughtDetails(
        initialType as StreamEventType,
        "pending",
      );
      const initialPhase = getPhaseByNode(initialType as StreamEventType);
      addThought(assistantId, {
        // 传入 messageId
        key: initialType,
        type: "node", // 标记为节点级
        phase: initialPhase,
        title: initialDetails.title,
        description: initialDetails.description,
        status: "pending",
      });

      try {
        // 3. 调用流式接口，传递版本化的 threadId
        // 修改请求：把当前代码文件一起传给后端
        const currentFiles = hasExistingFiles
          ? Object.fromEntries(
              Object.entries(sandpackFiles!).map(([filePath, file]) => [
                filePath,
                file.code,
              ]),
            )
          : undefined;

        const controller = new AbortController();
        abortRef.current = controller;

        await generateAppStream(
          {
            // 服务端负责管理历史：只发送最新一条消息，历史由服务端存储累积
            messages: [userMessage],
            projectId: threadId, // ✅ 使用版本化的 threadId
            files: currentFiles,
          },
          (event) => {
            const { type, data } = event;
            console.log("[useChat] Stream Event:", type);

            if (type === "done") return;

            if (type === "stopped") {
              addThought(assistantId, {
                key: `stopped-${Date.now()}`,
                title: "已停止生成",
                description: "本次生成已手动停止，当前文件保持不变。",
                status: "success",
              });
              return;
            }

            if (type === "answer") {
              const payload = data as { content?: string };
              updateMessageContent(assistantId, payload.content || "");
              return;
            }

            if (type === "error") {
              const payload = event as {
                message?: string;
                data?: { message?: string };
              };
              // 定位当前卡住的步骤，让错误提示更有上下文
              const currentThoughts =
                useChatStore.getState().messageThoughts[assistantId] || [];
              const pendingStep = [...currentThoughts]
                .reverse()
                .find((t) => t.status === "pending");
              const stepLabel =
                pendingStep && typeof pendingStep.title === "string"
                  ? pendingStep.title
                  : "";
              const errorText =
                payload.data?.message || payload.message || "未知错误";
              addThought(assistantId, {
                // 传入 messageId
                key: `error-${Date.now()}`,
                title: stepLabel ? `${stepLabel}失败` : "发生错误",
                description: `${errorText}${
                  stepLabel ? `（失败步骤：${stepLabel}）` : ""
                }。可稍后重试，或点击“停止生成”后重新发起。`,
                status: "error",
              });
              return;
            }

            // 特殊处理：files / figmaAssembly / modificationFiles 事件
            // - 更新 Sandpack
            // - 保存版本快照（修改流程携带变更统计）
            if (
              type === "files" ||
              type === "figmaAssembly" ||
              type === "modificationFiles"
            ) {
              const filesPayload = data as
                | {
                    files?: Record<string, string>;
                    stats?: {
                      changes?: {
                        added?: string[];
                        modified?: string[];
                        deleted?: string[];
                      };
                    };
                  }
                | undefined;
              if (
                filesPayload?.files &&
                Object.keys(filesPayload.files).length > 0
              ) {
                console.log(
                  "[useChat] Setting generated files:",
                  Object.keys(filesPayload.files).length,
                );
                setGeneratedFiles(filesPayload.files);

                // 修改流程返回的变更统计（后端计算 added/modified/deleted）
                const rawChanges = filesPayload.stats?.changes;
                const changes: {
                  added: string[];
                  modified: string[];
                  deleted: string[];
                } | undefined = rawChanges
                  ? {
                      added: rawChanges.added || [],
                      modified: rawChanges.modified || [],
                      deleted: rawChanges.deleted || [],
                    }
                  : undefined;

                // ✅ 保存版本快照
                saveVersion({
                  versionNumber: newVersion,
                  threadId: threadId,
                  operation: operation,
                  prompt: content,
                  timestamp: Date.now(),
                  files: filesPayload.files,
                  fileCount: Object.keys(filesPayload.files).length,
                  changes,
                });

                console.log("[useChat] Version saved:", {
                  version: newVersion,
                  operation,
                  fileCount: Object.keys(filesPayload.files).length,
                });
              } else {
                console.warn("[useChat] Files event missing payload:", data);
              }
            }

            // 特殊处理：intent 事件 - 更新项目名称
            if (type === "intent") {
              const intentPayload = data as {
                product?: { name?: string };
              };
              if (intentPayload.product?.name) {
                console.log(
                  "[useChat] Updating project name:",
                  intentPayload.product.name,
                );
                updateProjectName(intentPayload.product.name);
              }
            }

            // 核心逻辑修正：
            // 收到 event type (如 "analysis") 代表该步骤已完成
            // 1. 更新当前步骤为完成
            // 2. 开启下一个步骤为 pending

            const currentStepDetails = getThoughtDetails(
              type as StreamEventType,
              "success",
              data,
            );

            // 更新当前步骤状态
            updateThought(assistantId, type, {
              // ✨ 传入 messageId
              status: "success",
              description: currentStepDetails.description,
              content: JSON.stringify(data, null, 2),
            });

            // 阶段聚合逻辑：更新阶段进度并检测是否需要折叠
            const currentPhase = getPhaseByNode(type as StreamEventType);
            if (currentPhase) {
              updatePhaseProgress(currentPhase);

              // 检测阶段是否完成
              const phaseInfo =
                useChatStore.getState().phaseCompletion[currentPhase];
              if (phaseInfo && phaseInfo.completed === phaseInfo.total) {
                // 阶段完成，触发折叠
                collapsePhase(assistantId, currentPhase); // ✨ 传入 messageId
              }
            }

            // 查找并启动下一个步骤
            const nextType = NEXT_STEP_MAP[type];
            const shouldSkipNext =
              type === "analysis" &&
              typeof data === "object" &&
              data !== null &&
              "skipGeneration" in data &&
              (data as { skipGeneration?: boolean }).skipGeneration === true;

            if (nextType && nextType !== "done" && !shouldSkipNext) {
              // 如果下一个步骤是组装（app / modificationFiles），设置组装状态
              if (nextType === "app" || nextType === "modificationFiles") {
                setIsAssembling(true);
              }

              const nextDetails = getThoughtDetails(
                nextType as StreamEventType,
                "pending",
              );
              const nextPhase = getPhaseByNode(nextType as StreamEventType);
              addThought(assistantId, {
                // ✨ 传入 messageId
                key: nextType,
                type: "node", // 标记为节点级
                phase: nextPhase,
                title: nextDetails.title,
                description: nextDetails.description,
                status: "pending",
              });
            }
          },
          controller.signal,
        );
      } catch (error) {
        console.error("Generate App Error:", error);
        addThought(assistantId, {
          // ✨ 传入 messageId
          key: `error-${Date.now()}`,
          title: "发生错误",
          description: error instanceof Error ? error.message : "未知错误",
          status: "error",
        });
      } finally {
        abortRef.current = null;
        setLoading(false);
      }
    },
    [
      addMessage,
      updateMessageContent,
      setLoading,
      archiveThoughts,
      addThought,
      updateThought,
      updatePhaseProgress,
      collapsePhase,
      setGeneratedFiles,
      setIsAssembling,
      messages, // 用于判断是否为编辑操作
      incrementVersion, // 版本管理
      getCurrentThreadId, // 版本管理
      saveVersion, // 版本管理
      updateProjectName, // 项目名称更新
      setCurrentFlow, // 流程类型设置
    ],
  );

  /**
   * 停止当前生成：
   * 1. 通知后端取消 LangGraph 运行（避免继续消耗 LLM token）
   * 2. 中断本地 SSE 读取，触发 stopped 事件
   */
  const stopGeneration = useCallback(() => {
    const threadId = useChatStore.getState().getCurrentThreadId();
    void stopChatStream(threadId);
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
  };
}

import { UISchema } from "../schemas/uiSchema.js";
import { UI_SYSTEM_PROMPT } from "../prompts/uiPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

function buildFallbackUI(capabilities: any, intent: any) {
  const pages = Array.isArray(capabilities?.pages) ? capabilities.pages : [];
  const behaviors = Array.isArray(capabilities?.behaviors)
    ? capabilities.behaviors
    : [];
  const dataModels = Array.isArray(capabilities?.dataModels)
    ? capabilities.dataModels
    : [];
  const primaryModel = dataModels[0]?.modelId || "";
  const productName = intent?.product?.name || "Generated App";

  const fallbackPages = (pages.length ? pages : [{ pageId: "HomePage" }]).map(
    (page: any, index: number) => {
      const pageId = page.pageId || (index === 0 ? "HomePage" : `Page${index}`);
      const route = index === 0 ? "/" : `/${String(pageId).toLowerCase()}`;
      const scopedBehaviors = behaviors
        .filter((behavior: any) => behavior?.scope?.includes?.(pageId))
        .map((behavior: any) => behavior.behaviorId)
        .filter(Boolean);

      return {
        pageId,
        route: page.route || route,
        description:
          page.description || `${productName} page for ${String(pageId)}`,
        layout: page.pageType === "dashboard" ? "dashboard-shell" : "default",
        sections: [
          {
            sectionId: "hero",
            role: "dashboard",
            layout: "grid",
            title: productName,
            components: [
              {
                id: `${pageId}Hero`,
                type: "Card",
                label: "Hero",
                bindDataModel: primaryModel,
                bindBehavior: scopedBehaviors,
              },
              {
                id: `${pageId}PrimaryAction`,
                type: "Button",
                label: "Primary action",
                bindDataModel: primaryModel,
                bindBehavior: scopedBehaviors.slice(0, 1),
              },
            ],
          },
          {
            sectionId: "content",
            role: page.pageType === "form" ? "form" : "list",
            layout: "grid",
            title: "Content",
            components: [
              {
                id: `${pageId}Overview`,
                type: "Card",
                label: "Overview",
                bindDataModel: primaryModel,
                bindBehavior: scopedBehaviors,
              },
              {
                id: `${pageId}Details`,
                type: "List",
                label: "Details",
                bindDataModel: primaryModel,
                bindBehavior: scopedBehaviors,
              },
            ],
          },
        ],
      };
    },
  );

  return {
    pages: fallbackPages,
    themeStrategy: "Modern, professional, responsive Chinese interface.",
  };
}

export async function uiNode(state: any) {
  const structuredModel = getStructuredModel(UISchema);
  const capabilities = state.capabilities;

  if (!capabilities) {
    console.warn("[UINode] No capability data found, using fallback UI.");
    return { ui: buildFallbackUI({}, state.intent) };
  }

  const intentContext = state.intent
    ? JSON.stringify(state.intent, null, 2)
    : "Not provided";
  const analysisContext = state.analysis
    ? JSON.stringify(state.analysis, null, 2)
    : "Not provided";
  const capabilityContext = JSON.stringify(capabilities, null, 2);

  const humanPrompt = `Generate a UI architecture plan from the context below. Return valid JSON only.

Intent:
${intentContext}

Capabilities:
${capabilityContext}

Analysis:
${analysisContext}`;

  const messages = [
    new SystemMessage(UI_SYSTEM_PROMPT),
    new HumanMessage(humanPrompt),
  ];

  const mockResult = await tryExecuteMock(
    state,
    "uiNode",
    "uiResult.json",
    "ui",
  );
  if (mockResult) return mockResult;

  console.log("--- UI Architecture Analysis Start ---");

  try {
    const result = await withRetry(structuredModel, messages, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.warn(
          `[UINode] Retry attempt ${attempt} due to:`,
          error.message,
        );
      },
      formatErrorFeedback: (error) =>
        `Previous UI schema generation failed:\n${error.message}\n\nReturn valid JSON that matches the schema. Section role must be one of navigation, filter, list, detail, editor, dashboard, form.`,
    });

    console.log("--- UI Architecture Analysis End ---");

    return {
      ui: result,
    };
  } catch (error) {
    console.warn(
      "[UINode] Falling back to deterministic UI plan:",
      error instanceof Error ? error.message : error,
    );

    return {
      ui: buildFallbackUI(capabilities, state.intent),
    };
  }
}

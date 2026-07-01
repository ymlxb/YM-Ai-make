import { CapabilitySchema } from "../schemas/capabilitySchema.js";
import { CAPABILITY_SYSTEM_PROMPT } from "../prompts/capabilityPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

function buildFallbackCapabilities(intentData: any) {
  const productName = intentData?.product?.name || "Generated App";
  const primaryGoals = intentData?.goals?.primary || ["展示产品价值", "引导用户转化"];
  const description = `${intentData?.product?.description || ""} ${intentData?.category || ""}`;
  const isTravel = /旅行|旅游|行程|预算|目的地|travel|trip/i.test(description);

  if (isTravel) {
    return {
      pages: [
        {
          pageType: "landing",
          pageId: "HomePage",
          description: `${productName} 的移动端首页，展示行程卡片、预算统计和目的地推荐。`,
          supportedGoals: primaryGoals,
        },
        {
          pageType: "list",
          pageId: "ItineraryPage",
          description: "行程卡片管理页面，用于查看和编辑旅行计划。",
          supportedGoals: primaryGoals,
        },
      ],
      behaviors: [
        {
          behaviorId: "createItinerary",
          description: "创建新的旅行行程卡片",
          scope: ["HomePage", "ItineraryPage"],
          optional: false,
        },
        {
          behaviorId: "trackBudget",
          description: "统计旅行预算和支出",
          scope: ["HomePage"],
          optional: false,
        },
        {
          behaviorId: "exploreDestination",
          description: "查看目的地推荐",
          scope: ["HomePage", "ItineraryPage"],
          optional: false,
        },
      ],
      dataModels: [
        {
          modelId: "Itinerary",
          description: "旅行行程卡片",
          complexity: "list+detail",
          fields: ["id", "title", "destination", "startDate", "endDate", "budget", "status"],
        },
        {
          modelId: "BudgetItem",
          description: "旅行预算条目",
          complexity: "simple",
          fields: ["id", "category", "amount", "currency", "note"],
        },
        {
          modelId: "Destination",
          description: "目的地推荐",
          complexity: "static",
          fields: ["id", "name", "country", "image", "description", "tags"],
        },
      ],
    };
  }

  return {
    pages: [
      {
        pageType: "landing",
        pageId: "HomePage",
        description: `${productName} 的中文官网首页，展示核心卖点、功能、评价、价格和转化按钮。`,
        supportedGoals: primaryGoals,
      },
    ],
    behaviors: [
      {
        behaviorId: "startExperience",
        description: "点击立即体验按钮进入产品试用流程",
        scope: ["HomePage"],
        optional: false,
      },
      {
        behaviorId: "viewPricing",
        description: "查看价格套餐并选择合适方案",
        scope: ["HomePage"],
        optional: false,
      },
      {
        behaviorId: "submitContact",
        description: "提交联系方式以获取产品咨询",
        scope: ["HomePage"],
        optional: true,
      },
    ],
    dataModels: [
      {
        modelId: "Feature",
        description: "官网功能卖点",
        complexity: "static",
        fields: ["id", "title", "description", "icon", "highlight"],
      },
      {
        modelId: "PricingPlan",
        description: "价格套餐信息",
        complexity: "static",
        fields: ["id", "name", "price", "description", "features", "recommended"],
      },
      {
        modelId: "Testimonial",
        description: "用户评价内容",
        complexity: "static",
        fields: ["id", "name", "role", "company", "content", "rating"],
      },
    ],
  };
}

function normalizeCapabilities(result: any, intentData: any) {
  const candidate = result?.capabilities || result;

  if (
    candidate &&
    Array.isArray(candidate.pages) &&
    Array.isArray(candidate.behaviors) &&
    Array.isArray(candidate.dataModels)
  ) {
    return candidate;
  }

  console.warn("[CapabilityNode] Invalid capability result, using fallback.");
  return buildFallbackCapabilities(intentData);
}

export async function capabilityNode(state: any) {
  const structuredModel = getStructuredModel(CapabilitySchema);
  const intentData = state.intent;

  if (!intentData) {
    console.warn("CapabilityNode: No intent data found, using fallback.");
    return { capabilities: buildFallbackCapabilities({}) };
  }

  const intentContext = JSON.stringify(intentData, null, 2);
  const messages = [
    new SystemMessage(CAPABILITY_SYSTEM_PROMPT),
    new HumanMessage(`Analyze app capabilities from this product intent:\n${intentContext}`),
  ];

  const mockResult = await tryExecuteMock(
    state,
    "capabilityNode",
    "capabilityResult.json",
    "capabilities",
  );
  if (mockResult) return mockResult;

  console.log("--- Capability Analysis Start ---");

  try {
    const result = await withRetry(structuredModel, messages, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.warn(
          `[CapabilityNode] Retry attempt ${attempt} due to:`,
          error.message,
        );
      },
    });

    console.log("--- Capability Analysis End ---");
    const capabilities = normalizeCapabilities(result, intentData);
    console.log(
      "[CapabilityNode] pages/models:",
      capabilities.pages?.length || 0,
      capabilities.dataModels?.map((model: any) => model.modelId).join(",") ||
        "none",
    );

    return {
      capabilities,
    };
  } catch (error) {
    console.warn(
      "[CapabilityNode] Falling back to deterministic capabilities:",
      error instanceof Error ? error.message : error,
    );

    return {
      capabilities: buildFallbackCapabilities(intentData),
    };
  }
}

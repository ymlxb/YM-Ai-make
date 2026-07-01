import { MockDataSchema } from "../schemas/mockDataSchema.js";
import { MOCK_DATA_SYSTEM_PROMPT } from "../prompts/mockDataPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { normalizeCodeFiles } from "../../../../utils/codeNormalizer.js";
import { T_Graph } from "../../../../shared/schemas/graphSchema.js";

function inferValue(field: string) {
  const lower = field.toLowerCase();
  if (lower === "id" || lower.endsWith("id")) return "`${index}`";
  if (lower.includes("price")) return "index === 1 ? '免费' : '¥99/月'";
  if (lower.includes("rating")) return "5";
  if (lower.includes("recommended")) return "index === 1";
  if (lower.includes("features")) return "['智能分析', '中文优化', '一键生成']";
  if (lower.includes("icon")) return "'sparkles'";
  if (lower.includes("highlight")) return "index === 0";
  if (lower.includes("title") || lower.includes("name")) return "`示例${index + 1}`";
  if (lower.includes("description") || lower.includes("content")) {
    return "`这是一条用于页面展示的中文示例内容 ${index + 1}`";
  }
  return "`示例值${index + 1}`";
}

function buildFallbackMockFile(model: any, structureFiles: any[]) {
  const targetFile = structureFiles.find(
    (f) =>
      (f.sourceCorrelation === model.modelId && f.generatedBy === "mockData") ||
      (f.path.includes(model.modelId) && f.path.includes("/data/")),
  );
  const targetPath = targetFile ? targetFile.path : `/data/${model.modelId}Data.ts`;
  const fields = Array.isArray(model.fields) && model.fields.length
    ? model.fields
    : ["id", "name", "description"];
  const objectBody = fields
    .map((field: any) => {
      const name = typeof field === "string" ? field : field.name;
      return `    ${name}: ${inferValue(name)},`;
    })
    .join("\n");

  const code = `export const ${model.modelId}Data = Array.from({ length: 3 }, (_, index) => ({\n${objectBody}\n}));\n`;

  return {
    path: targetPath,
    code,
    description: `${model.modelId} mock data`,
  };
}

function generatePromptForModel(model: any, intent: any, structureFiles: any[]) {
  const targetFile = structureFiles.find(
    (f) =>
      (f.sourceCorrelation === model.modelId && f.generatedBy === "mockData") ||
      (f.path.includes(model.modelId) && f.path.includes("/data/")),
  );
  const targetPath = targetFile ? targetFile.path : `/data/${model.modelId}Data.ts`;

  return `Generate mock data file for model "${model.modelId}".
Description: ${model.description}
Fields: ${(model.fields || []).join(", ")}
Target path: ${targetPath}
App goals: ${(intent?.goals?.primary || []).join(", ")}
Return only this file.`;
}

export async function mockDataNode(state: T_Graph) {
  const structuredModel = getStructuredModel(MockDataSchema);
  const { capabilities, intent, structure } = state;
  const dataModels = capabilities?.dataModels || [];
  const structureFiles = structure?.files || [];

  if (!dataModels.length) {
    console.warn("MockDataNode: Missing dataModels, skipping.");
    return { mockData: { files: [] } };
  }

  const mockResult = await tryExecuteMock(
    state,
    "mockDataNode",
    "mockDataResult.json",
    "mockData",
  );
  if (mockResult) return mockResult;

  console.log(
    `--- Mock Data Generation Start (${dataModels.length} models) ---`,
  );

  const tasks = dataModels.map(async (model) => {
    try {
      const humanPrompt = generatePromptForModel(model, intent, structureFiles);
      const messages = [
        new SystemMessage(MOCK_DATA_SYSTEM_PROMPT),
        new HumanMessage(humanPrompt),
      ];

      const result = await withRetry(structuredModel, messages, {
        maxRetries: 2,
        onRetry: (attempt, error) => {
          console.warn(
            `[MockDataNode] Retry ${model.modelId} attempt ${attempt} due to:`,
            error.message,
          );
        },
      });

      return result.files || [];
    } catch (error) {
      console.warn(
        `MockDataNode: Falling back for ${model.modelId}`,
        error instanceof Error ? error.message : error,
      );
      return [buildFallbackMockFile(model, structureFiles)];
    }
  });

  const results = await Promise.all(tasks);
  const normalizedFiles = normalizeCodeFiles(results.flat());

  console.log(`--- Mock Data Generation End (${normalizedFiles.length}) ---`);

  return {
    mockData: {
      files: normalizedFiles,
    },
  };
}

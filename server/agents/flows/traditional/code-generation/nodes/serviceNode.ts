import { ServiceSchema } from "../schemas/serviceSchema.js";
import { LOGIC_SYSTEM_PROMPT } from "../prompts/servicePrompt.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { normalizeCodeFiles } from "../../../../utils/codeNormalizer.js";

function buildFallbackServiceFile(model: any) {
  const modelId = model.modelId || "Item";
  const varName = `${modelId.charAt(0).toLowerCase()}${modelId.slice(1)}Data`;
  const serviceName = `${modelId.charAt(0).toLowerCase()}${modelId.slice(1)}Service`;

  return {
    path: `/services/${serviceName}.ts`,
    code: `import { ${varName} } from '../data/${modelId}Data';\n\nexport async function get${modelId}List() {\n  return Promise.resolve(${varName});\n}\n\nexport async function get${modelId}ById(id: string) {\n  return Promise.resolve(${varName}.find((item: any) => String(item.id) === String(id)) || null);\n}\n`,
    description: `${modelId} service`,
  };
}

function generatePromptForService(
  model: any,
  mockDataFiles: any[],
  utilsFiles: any[],
  typeFiles: any[],
  intent: any,
) {
  const mockFile = mockDataFiles.find((f) =>
    f.path.toLowerCase().includes(model.modelId.toLowerCase()),
  );
  const mockContext = mockFile
    ? `Mock data file path: ${mockFile.path}`
    : `Use fallback mock data import ../data/${model.modelId}Data`;
  const utilsContext = utilsFiles.map((f) => `- ${f.path}`).join("\n");
  const typesContext = typeFiles.map((f) => `- ${f.path}`).join("\n");

  return `Generate one TypeScript service file for model "${model.modelId}".
Description: ${model.description}
Fields: ${(model.fields || []).join(", ")}
${mockContext}
Types:
${typesContext}
Utils:
${utilsContext}
Primary goals: ${(intent?.goals?.primary || []).join(", ")}`;
}

export async function serviceNode(state: T_Graph) {
  const structuredModel = getStructuredModel(ServiceSchema);
  const { capabilities, intent, mockData, utils, types } = state;
  const dataModels = capabilities?.dataModels || [];
  const mockDataFiles = (mockData as any)?.files || [];
  const utilsFiles = (utils as any)?.files || [];
  const typeFiles = (types as any)?.files || [];

  if (!dataModels.length) {
    console.warn("ServiceNode: Missing dataModels, skipping.");
    return { service: { files: [] } };
  }

  const mockResult = await tryExecuteMock(
    state,
    "serviceNode",
    "serviceResult.json",
    "service",
  );
  if (mockResult) return mockResult;

  console.log(
    `--- Service Generation Start (${dataModels.length} models) ---`,
  );

  const tasks = dataModels.map(async (model) => {
    try {
      const humanPrompt = generatePromptForService(
        model,
        mockDataFiles,
        utilsFiles,
        typeFiles,
        intent,
      );
      const messages = [
        new SystemMessage(LOGIC_SYSTEM_PROMPT),
        new HumanMessage(humanPrompt),
      ];

      const result = await withRetry(structuredModel, messages, {
        maxRetries: 2,
        onRetry: (attempt, error) => {
          console.warn(
            `[ServiceNode] Retry ${model.modelId} attempt ${attempt} due to:`,
            error.message,
          );
        },
      });

      return result.files || [];
    } catch (error) {
      console.warn(
        `ServiceNode: Falling back for ${model.modelId}`,
        error instanceof Error ? error.message : error,
      );
      return [buildFallbackServiceFile(model)];
    }
  });

  const results = await Promise.all(tasks);
  const normalizedFiles = normalizeCodeFiles(results.flat());

  console.log(`--- Service Generation End (${normalizedFiles.length}) ---`);

  return {
    service: {
      files: normalizedFiles,
    },
  };
}

import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { TypeFileSchema } from "../schemas/typeSchema.js";
import { TYPE_GENERATION_SYSTEM_PROMPT } from "../prompts/typePrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { normalizeCodeFile } from "../../../../utils/codeNormalizer.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

function toPascalCase(value = "Model") {
  return value
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("") || "Model";
}

function inferFieldType(field: any) {
  if (typeof field !== "string") {
    return field.type || "string";
  }

  const name = field.toLowerCase();
  if (name.includes("id")) return "string";
  if (name.includes("count") || name.includes("price") || name.includes("total")) {
    return "number";
  }
  if (name.includes("is") || name.includes("has")) return "boolean";
  if (name.includes("at") || name.includes("date") || name.includes("time")) {
    return "string";
  }
  return "string";
}

function buildFallbackTypeFile(fileNode: any, modelDef: any) {
  const modelId = modelDef?.modelId || fileNode.sourceCorrelation || "Model";
  const interfaceName = toPascalCase(modelId);
  const fields = Array.isArray(modelDef?.fields) ? modelDef.fields : ["id", "name"];
  const body = fields
    .map((field: any) => {
      const name = typeof field === "string" ? field : field.name;
      return `  ${name}: ${inferFieldType(field)};`;
    })
    .join("\n");

  return normalizeCodeFile({
    path: fileNode.path,
    modelId,
    code: `export interface ${interfaceName} {\n${body}\n}\n`,
  });
}

export async function typeNode(state: T_Graph) {
  const targetFiles =
    state.structure?.files.filter((f) => f.generatedBy === "typeDefinition") ||
    [];

  if (targetFiles.length === 0) {
    console.warn("TypeNode: No type definition files found in structure plan.");
    return { types: { files: [] } };
  }

  const dataModels = state.capabilities?.dataModels || [];
  const existingModelNames = dataModels.map((m) => m.modelId).join(", ");

  const mockResult = await tryExecuteMock(
    state,
    "typeNode",
    "typeResult.json",
    (result) => {
      const mockFiles = result.files || [];
      console.log(
        `--- Type Generation Loaded Mock Data (${mockFiles.length} files) ---`,
      );
      return { types: { files: mockFiles } };
    },
  );
  if (mockResult) return mockResult;

  console.log(
    `--- Type Generation HEAD Start (${targetFiles.length} files) ---`,
  );

  const model = getStructuredModel(TypeFileSchema);

  const generatePromises = targetFiles.map(async (fileNode) => {
    const modelId = fileNode.sourceCorrelation;
    const modelDef = dataModels.find((m) => m.modelId === modelId);

    if (!modelDef) {
      console.warn(
        `TypeNode: Model definition not found for ${modelId}, using fallback.`,
      );
      return buildFallbackTypeFile(fileNode, { modelId });
    }

    const modelContext = JSON.stringify(modelDef, null, 2);
    const userPrompt = `Generate a TypeScript type definition for data model "${modelId}".
File path: ${fileNode.path}

Model details:
${modelContext}

Available model names: ${existingModelNames}

Return complete .ts file content with imports only when necessary.`;

    try {
      const messages = [
        new SystemMessage(TYPE_GENERATION_SYSTEM_PROMPT),
        new HumanMessage(userPrompt),
      ];

      const result = await withRetry(model, messages, {
        maxRetries: 2,
        onRetry: (attempt, error) => {
          console.warn(
            `[TypeNode] Retry ${fileNode.path} attempt ${attempt} due to:`,
            error.message,
          );
        },
      });

      return normalizeCodeFile({
        ...result,
        path: fileNode.path,
        modelId: modelId || "Unknown",
      });
    } catch (error) {
      console.warn(
        `TypeNode: Falling back for ${fileNode.path}`,
        error instanceof Error ? error.message : error,
      );
      return buildFallbackTypeFile(fileNode, modelDef);
    }
  });

  const results = await Promise.all(generatePromises);
  const validResults = results.filter((r) => r !== null) as any[];

  console.log(`--- Type Generation End (Generated ${validResults.length}) ---`);

  return {
    types: {
      files: validResults,
    },
  };
}

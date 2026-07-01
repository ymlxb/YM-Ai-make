import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { StructureSchema } from "../schemas/structureSchema.js";
import { STRUCTURE_SYSTEM_PROMPT } from "../prompts/structurePrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

function buildFallbackStructure(state: T_Graph) {
  const components = state.components?.components || [];
  const dataModels = state.capabilities?.dataModels || [];
  const pages = state.ui?.pages || [];
  const files: any[] = [];

  for (const page of pages.length ? pages : [{ pageId: "HomePage" }]) {
    files.push({
      path: `/pages/${page.pageId}.tsx`,
      kind: "new",
      description: `${page.pageId} page`,
      sourceCorrelation: page.pageId,
      generatedBy: "page",
    });
  }

  for (const component of components) {
    const componentId = component.originalId || component.componentId;
    if (!componentId) continue;
    files.push({
      path: `/components/${componentId}.tsx`,
      kind: "new",
      description: component.description || `${componentId} component`,
      sourceCorrelation: componentId,
      generatedBy: "component",
    });
  }

  for (const model of dataModels) {
    files.push({
      path: `/types/${model.modelId}.ts`,
      kind: "new",
      description: `${model.modelId} types`,
      sourceCorrelation: model.modelId,
      generatedBy: "typeDefinition",
    });
    files.push({
      path: `/data/${model.modelId}Data.ts`,
      kind: "new",
      description: `${model.modelId} mock data`,
      sourceCorrelation: model.modelId,
      generatedBy: "mockData",
    });
    files.push({
      path: `/hooks/use${model.modelId}s.ts`,
      kind: "new",
      description: `${model.modelId} data hook`,
      sourceCorrelation: model.modelId,
      generatedBy: "hooks",
    });
  }

  files.push(
    {
      path: "/services/api.ts",
      kind: "new",
      description: "Local service helpers",
      sourceCorrelation: null,
      generatedBy: "service",
    },
    {
      path: "/lib/utils.ts",
      kind: "new",
      description: "Shared utilities",
      sourceCorrelation: null,
      generatedBy: "utils",
    },
    {
      path: "/App.tsx",
      kind: "overwrite",
      description: "Application entry component",
      sourceCorrelation: null,
      generatedBy: "app",
    },
  );

  return { files };
}

function toPascalCase(value = "") {
  return value
    .replace(/\.(tsx|ts|jsx|js)$/i, "")
    .replace(/Data$/i, "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function inferSourceCorrelation(file: any) {
  if (file.sourceCorrelation !== undefined) return file.sourceCorrelation;

  const fileName = file.path?.split("/")?.pop() || "";
  if (
    file.generatedBy === "typeDefinition" ||
    file.generatedBy === "mockData" ||
    file.generatedBy === "hooks" ||
    file.generatedBy === "hook"
  ) {
    return toPascalCase(fileName);
  }

  if (file.generatedBy === "component" || file.generatedBy === "page") {
    return toPascalCase(fileName);
  }

  return null;
}

function normalizeStructure(response: any) {
  const files = Array.isArray(response?.files) ? response.files : [];

  return {
    files: files.map((file: any) => ({
      ...file,
      sourceCorrelation: inferSourceCorrelation(file),
    })),
  };
}

export const structureNode = async (state: T_Graph) => {
  const model = getStructuredModel(StructureSchema);
  const componentSpecs = state.components?.components || [];
  const dataModels = state.capabilities?.dataModels || [];
  const pages = state.ui?.pages || [];

  const componentsList = componentSpecs
    .map(
      (c) =>
        `- ComponentId: ${c.originalId || c.componentId} (Props: ${c.props?.length || 0}, Events: ${c.events?.length || 0})`,
    )
    .join("\n");

  const modelsList = dataModels
    .map((m) => `- ModelId: ${m.modelId} (Desc: ${m.description})`)
    .join("\n");

  const pagesList = pages
    .map((p) => `- PageId: ${p.pageId} (Route: ${p.route})`)
    .join("\n");

  const userPrompt = `Create a Sandpack file structure for this React app.

Pages:
${pagesList}

Components:
${componentsList}

Data models:
${modelsList}`;

  const messages = [
    new SystemMessage(STRUCTURE_SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ];

  const mockResult = await tryExecuteMock(
    state,
    "structureNode",
    "structureResult.json",
    "structure",
  );
  if (mockResult) return mockResult;

  console.log("--- Project Structure Planning Start ---");

  try {
    const response = await withRetry(model, messages, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.warn(
          `[StructureNode] Retry attempt ${attempt} due to:`,
          error.message,
        );
      },
    });

    console.log("--- Project Structure Planning End ---");

    return {
      structure: normalizeStructure(response),
    };
  } catch (error) {
    console.warn(
      "[StructureNode] Falling back to deterministic structure:",
      error instanceof Error ? error.message : error,
    );

    return {
      structure: buildFallbackStructure(state),
    };
  }
};

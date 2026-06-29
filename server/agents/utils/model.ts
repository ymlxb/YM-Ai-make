import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { ZodType } from "zod";

/**
 * 多模型架构：
 * - DeepSeek: 主模型选项1（用于大部分节点，支持 Function Calling）
 * - GLM: 主模型选项2（智谱 AI，支持 Function Calling）
 * - Qwen-VL: Vision 模型（仅用于图片分析）
 *
 * 通过环境变量 MAIN_MODEL_PROVIDER 切换主模型：deepseek | glm
 */

let deepseekInstance: ChatOpenAI | null = null;
let glmInstance: ChatOpenAI | null = null;
let qwenVisionInstance: ChatOpenAI | null = null;

/**
 * 获取 DeepSeek 主模型实例（用于大部分节点）
 * 支持 Function Calling，结构化输出能力强
 */
export function getDeepSeekModel() {
  if (!deepseekInstance) {
    deepseekInstance = new ChatOpenAI({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY,
      temperature: 0,
      maxTokens: 8192, // DeepSeek 最大支持 8K tokens
      configuration: {
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      },
    });
  }
  return deepseekInstance;
}

/**
 * 获取 GLM 主模型实例（智谱 AI）
 * 支持 Function Calling，结构化输出能力强
 */
export function getGLMModel() {
  if (!glmInstance) {
    glmInstance = new ChatOpenAI({
      model: process.env.GLM_MODEL || "glm-4-flash",
      apiKey: process.env.GLM_API_KEY,
      temperature: 0,
      maxTokens: 8192,
      configuration: {
        baseURL:
          process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/",
      },
    });
  }
  return glmInstance;
}

/**
 * 获取 Qwen-VL Vision 模型实例（仅用于图片分析）
 * 支持图片输入和分析
 */
export function getQwenVisionModel() {
  if (!qwenVisionInstance) {
    qwenVisionInstance = new ChatOpenAI({
      model: process.env.QWEN_MODEL || "qwen-vl-max",
      apiKey: process.env.QWEN_API_KEY,
      temperature: 0.1,
      maxTokens: 32768, // Qwen-VL-Max 支持 32K tokens
      configuration: {
        baseURL:
          process.env.QWEN_BASE_URL ||
          "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
    });
  }
  return qwenVisionInstance;
}

/**
 * 获取当前配置的主模型
 * 根据环境变量 MAIN_MODEL_PROVIDER 切换：deepseek | glm
 */
export function getMainModel() {
  const provider = process.env.MAIN_MODEL_PROVIDER || "deepseek";

  switch (provider.toLowerCase()) {
    case "glm":
      console.log("[Model] Using GLM as main model");
      return getGLMModel();
    case "deepseek":
    default:
      console.log("[Model] Using DeepSeek as main model");
      return getDeepSeekModel();
  }
}

/**
 * 获取默认模型（向后兼容）
 * 使用当前配置的主模型
 */
export function getModel() {
  return getMainModel();
}

/**
 * 获取支持结构化输出的模型实例
 * 使用当前配置的主模型，支持 Function Calling
 */
export function getStructuredModel<T extends ZodType<any>>(schema: T) {
  const model = getMainModel();
  return model.withStructuredOutput(schema, {
    method: "functionCalling",
    includeRaw: false,
  });
}

/**
 * 获取当前主模型提供商名称
 */
export function getMainModelProvider(): string {
  return process.env.MAIN_MODEL_PROVIDER || "deepseek";
}

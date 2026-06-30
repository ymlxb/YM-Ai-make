import { z } from "zod/v4";

const stringArray = (schema = z.array(z.string())) => z.preprocess((value) => {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Some models return array fields as a single plain string.
    }

    return [trimmed];
  }

  return value;
}, schema);

export const IntentSchema = z.object({
  product: z.object({
    name: z.string().min(1).describe("应用名称"),
    description: z.string().min(1).describe("应用描述"),
    targetUsers: stringArray(z.array(z.string()).min(1)).describe("目标用户"),
    primaryScenario: z.string().min(1).describe("主要场景"),
  }),
  goals: z.object({
    primary: stringArray(z.array(z.string()).min(1)).describe("应用要实现的主要目标"),
    secondary: stringArray().nullable().describe("应用要实现的次要目标"),
  }),
  nonGoals: stringArray().describe("应用不需要实现的目标"),
  assumptions: stringArray().nullable().describe("应用设计时的假设条件"),
  category: z.string().describe("应用类型"),
});

export type Intent = z.infer<typeof IntentSchema>;

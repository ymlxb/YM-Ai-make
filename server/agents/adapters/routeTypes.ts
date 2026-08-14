/**
 * 路由层适配器的共享类型定义
 */

export interface RouteAdapterContext {
  messages: any[];
  mockConfig: Record<string, boolean>;
  /** 当前项目已有的代码文件（Sandpack 格式，如 "/App.tsx": "code"），修改流程依赖它 */
  files?: Record<string, string>;
}

export interface RouteAdapterResult {
  flow: "traditional" | "figma" | "modification";
  input: Record<string, any>;
  meta?: Record<string, any>;
}

export interface RouteInputAdapter {
  name: string;
  priority: number;
  canHandle(context: RouteAdapterContext): boolean;
  adapt(context: RouteAdapterContext): Promise<RouteAdapterResult>;
}

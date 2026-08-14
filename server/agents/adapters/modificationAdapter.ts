/**
 * 修改请求路由适配器
 *
 * 职责：
 * 1. 识别“修改请求”（关键词 + 已有代码两个条件同时满足）
 * 2. 将请求分发给 modification 流程，并把当前代码文件一并传入
 * 3. 若没有已有代码（用户第一条消息就说“修改/优化”），放行给传统生成流程
 */

import type { RouteInputAdapter } from "./routeTypes.js";
import {
  isModificationRequest,
  hasExistingFiles,
} from "./routeHelpers.js";

export const modificationRouteAdapter: RouteInputAdapter = {
  name: "modification-route",
  priority: 90,
  canHandle: ({ messages, files }) =>
    isModificationRequest(messages) && hasExistingFiles(files),
  adapt: async ({ messages, mockConfig, files }) => {
    const fileCount = Object.keys(files || {}).length;
    console.log("[RouteAdapter] Matched: modification-route");
    console.log(`  Current files count: ${fileCount}`);
    return {
      flow: "modification",
      input: { messages, mockConfig, currentFiles: files },
      meta: { routeType: "modification", fileCount },
    };
  },
};

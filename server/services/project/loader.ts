/**
 * 项目加载器
 * 加载已生成的项目（用于 MODIFY）
 */

import { loadProjectFiles } from "./store.js";

export const loadProject = async (projectId: string) => {
  const files = (await loadProjectFiles(projectId)) || {};
  return {
    structure: {},
    components: [],
    files: Object.entries(files).map(([filePath, content]) => ({
      filePath,
      content,
    })),
  };
};

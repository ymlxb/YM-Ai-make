/**
 * 鍏ㄥ眬 Mock 閰嶇疆
 *
 * 姝ら厤缃帶鍒?LangGraph Agent 鐨勯粯璁ゆā鎷熺瓥鐣ャ€? * 瀹冨喅瀹氫簡鐗瑰畾鑺傜偣鏄繑鍥為瀹氫箟鐨?Mock 鏁版嵁锛堝揩閫?绋冲畾锛夛紝
 * 杩樻槸鎵ц鐪熷疄鐨?LLM 閫昏緫锛堣緝鎱?鍏锋湁鍒涢€犳€э級銆? *
 * 鍊煎惈涔?
 * - true  : 鍚敤 Mock 妯″紡銆傝妭鐐瑰皢杩斿洖 `server/mock/*.json` 涓殑鏁版嵁銆? * - false : 绂佺敤 Mock 妯″紡銆傝妭鐐瑰皢璋冪敤 LLM銆? *
 * ============================================================================
 * 蹇€熶娇鐢ㄦ寚鍗? * ============================================================================
 *
 * 鏈厤缃敮鎸佷笁绉嶇矑搴︾殑鎺у埗锛屼紭鍏堢骇浠庝綆鍒伴珮锛歡lobal < phases < nodes
 *
 * 銆愭柟寮忎竴锛氫娇鐢ㄩ璁撅紙鏈€绠€鍗曪級銆? * 鐩存帴淇敼鏂囦欢搴曢儴鐨?DEFAULT_MOCK_PRESET锛? *
 *   export const DEFAULT_MOCK_PRESET = MOCK_PRESETS.allMock;      // 鍏ㄩ儴 mock
 *   export const DEFAULT_MOCK_PRESET = MOCK_PRESETS.allReal;      // 鍏ㄩ儴鐪熷疄 LLM
 *   export const DEFAULT_MOCK_PRESET = MOCK_PRESETS.planningMock; // 瑙勫垝闃舵 mock锛屽叾浠栫湡瀹? *
 * 銆愭柟寮忎簩锛氭寜闃舵鍒囨崲銆? * 5 涓樁娈靛彲鐙珛鎺у埗锛? *
 *   export const DEFAULT_MOCK_PRESET: MockConfig = {
 *     phases: {
 *       planning: true,     // I. 瑙勫垝闃舵 (Step 0-6) - mock
 *       foundation: true,   // II. 鍩虹寤鸿 (Step 7-9) - mock
 *       logic: false,       // III. 閫昏緫鏋勫缓 (Step 10-11) - 鐪熷疄 LLM
 *       view: false,        // IV. 瑙嗗浘鏋勫缓 (Step 12-14) - 鐪熷疄 LLM
 *       assembly: false,    // V. 搴旂敤缁勮 (Step 15) - 鐪熷疄 LLM
 *     }
 *   };
 *
 * 銆愭柟寮忎笁锛氭寜鑺傜偣寰皟锛堟渶缁嗙矑搴︼級銆? * nodes 绾у埆閰嶇疆浼氳鐩?phases 鍜?global锛? *
 *   export const DEFAULT_MOCK_PRESET: MockConfig = {
 *     global: true,                    // 榛樿鍏ㄩ儴 mock
 *     phases: { view: false },         // 瑙嗗浘闃舵鐢ㄧ湡瀹?LLM
 *     nodes: { styleGenNode: true }    // 浣嗘牱寮忕敓鎴愪粛鐢?mock锛堣鐩?phases锛? *   };
 *
 * 銆愰樁娈典笌鑺傜偣瀵圭収琛ㄣ€? *
 *   I. 瑙勫垝闃舵 (planning):
 *      - analysisNode, intentNode, capabilityNode, uiNode,
 *        componentNode, structureNode, dependencyNode
 *
 *   II. 鍩虹寤鸿 (foundation):
 *      - typeNode, utilsNode, mockDataNode
 *
 *   III. 閫昏緫鏋勫缓 (logic):
 *      - serviceNode, hooksNode
 *
 *   IV. 瑙嗗浘鏋勫缓 (view):
 *      - componentSubgraph, pageSubgraph, layoutNode, styleGenNode
 *
 *   V. 搴旂敤缁勮 (assembly):
 *      - appGenNode
 *
 * ============================================================================
 */

// ============================================================================
// 绫诲瀷瀹氫箟
// ============================================================================

/** 鎵€鏈夎妭鐐瑰悕绉?*/
export type NodeName =
  | "analysisNode"
  | "intentNode"
  | "capabilityNode"
  | "uiNode"
  | "componentNode"
  | "structureNode"
  | "dependencyNode"
  | "typeNode"
  | "utilsNode"
  | "mockDataNode"
  | "serviceNode"
  | "hooksNode"
  | "componentSubgraph"
  | "pageSubgraph"
  | "layoutNode"
  | "styleGenNode"
  | "appGenNode"
  | "modificationAnalysisNode"
  | "modificationLocateNode"
  | "modificationApplyNode"
  | "modificationAssembleNode";

/** 闃舵鍚嶇О */
export type PhaseName =
  | "planning" // I. 瑙勫垝闃舵 (Step 0-6)
  | "foundation" // II. 鍩虹寤鸿 (Step 7-9)
  | "logic" // III. 閫昏緫鏋勫缓 (Step 10-11)
  | "view" // IV. 瑙嗗浘鏋勫缓 (Step 12-14)
  | "assembly"; // V. 搴旂敤缁勮 (Step 15)

/** 闃舵鍒拌妭鐐圭殑鏄犲皠 */
export const PHASE_NODES: Record<PhaseName, NodeName[]> = {
  planning: [
    "analysisNode",
    "intentNode",
    "capabilityNode",
    "uiNode",
    "componentNode",
    "structureNode",
    "dependencyNode",
    // Modification flow nodes (grouped here so global presets cover them)
    "modificationAnalysisNode",
    "modificationLocateNode",
    "modificationApplyNode",
    "modificationAssembleNode",
  ],
  foundation: ["typeNode", "utilsNode", "mockDataNode"],
  logic: ["serviceNode", "hooksNode"],
  view: ["componentSubgraph", "pageSubgraph", "layoutNode", "styleGenNode"],
  assembly: ["appGenNode"],
};

/** 闃舵鍏冩暟鎹紙鐢ㄤ簬鍓嶇灞曠ず锛?*/
export const PHASE_METADATA: Record<
  PhaseName,
  { title: string; order: number }
> = {
  planning: { title: "瑙勫垝闃舵", order: 1 },
  foundation: { title: "鍩虹寤鸿", order: 2 },
  logic: { title: "閫昏緫鏋勫缓", order: 3 },
  view: { title: "瑙嗗浘鏋勫缓", order: 4 },
  assembly: { title: "搴旂敤缁勮", order: 5 },
};

// ============================================================================
// 鍒嗗眰閰嶇疆鎺ュ彛
// ============================================================================

/**
 * 鍒嗗眰 Mock 閰嶇疆
 *
 * 鏀寔涓夌绮掑害鐨勬帶鍒讹紝鎸変紭鍏堢骇浠庝綆鍒伴珮锛? * 1. global: 鍏ㄥ眬寮€鍏? * 2. phases: 鎸夐樁娈垫帶鍒? * 3. nodes: 鎸夎妭鐐规帶鍒讹紙鏈€楂樹紭鍏堢骇锛屽彲瑕嗙洊涓婂眰璁剧疆锛? */
export interface MockConfig {
  /** 鍏ㄥ眬寮€鍏?- 鏈€浣庝紭鍏堢骇 */
  global?: boolean;

  /** 闃舵寮€鍏?- 涓瓑浼樺厛绾?*/
  phases?: Partial<Record<PhaseName, boolean>>;

  /** 鑺傜偣寮€鍏?- 鏈€楂樹紭鍏堢骇锛堣鐩栦笂灞傦級 */
  nodes?: Partial<Record<NodeName, boolean>>;
}

// ============================================================================
// 閰嶇疆瑙ｆ瀽鍑芥暟
// ============================================================================

/** 鎵€鏈夎妭鐐瑰悕绉板垪琛?*/
const ALL_NODES: NodeName[] = Object.values(PHASE_NODES).flat();

/**
 * 灏嗗垎灞?MockConfig 瑙ｆ瀽涓烘墎骞崇殑 Record<NodeName, boolean>
 *
 * 浼樺厛绾? nodes > phases > global > 榛樿鍊?true)
 *
 * @param config 鍒嗗眰閰嶇疆瀵硅薄
 * @returns 鎵佸钩鐨勮妭鐐归厤缃? */
export function resolveMockConfig(
  config: MockConfig,
): Record<NodeName, boolean> {
  const result: Record<NodeName, boolean> = {} as Record<NodeName, boolean>;

  for (const nodeName of ALL_NODES) {
    if (config.nodes?.[nodeName] !== undefined) {
      result[nodeName] = config.nodes[nodeName]!;
      continue;
    }

    if (config.phases) {
      const phase = getPhaseByNode(nodeName);
      if (phase && config.phases[phase] !== undefined) {
        result[nodeName] = config.phases[phase]!;
        continue;
      }
    }

    if (config.global !== undefined) {
      result[nodeName] = config.global;
      continue;
    }

    result[nodeName] = false;
  }

  return result;
}
/**
 * 鏍规嵁鑺傜偣鍚嶇О鑾峰彇鍏舵墍灞為樁娈? */
function getPhaseByNode(nodeName: NodeName): PhaseName | undefined {
  for (const [phase, nodes] of Object.entries(PHASE_NODES)) {
    if (nodes.includes(nodeName)) {
      return phase as PhaseName;
    }
  }
  return undefined;
}

// ============================================================================
// 棰勮閰嶇疆
// ============================================================================

/**
 * 甯哥敤閰嶇疆棰勮
 *
 * 浣跨敤鏂瑰紡: resolveMockConfig(MOCK_PRESETS.planningMock)
 */
export const MOCK_PRESETS = {
  /** 鍏ㄩ儴浣跨敤 Mock锛堟渶蹇紝鐢ㄤ簬 UI 璋冭瘯锛?*/
  allMock: { global: true } as MockConfig,

  /** 鍏ㄩ儴浣跨敤鐪熷疄 LLM锛堝畬鏁存祴璇曪級 */
  allReal: { global: false } as MockConfig,

  /** 浠呰鍒掗樁娈电敤 Mock锛屽叾浠栫敤鐪熷疄 LLM锛堣皟璇曚唬鐮佺敓鎴愶級 */
  planningMock: {
    global: false,
    phases: { planning: true },
  } as MockConfig,

  /** 瑙勫垝+鍩虹闃舵鐢?Mock锛岄€昏緫/瑙嗗浘/缁勮鐢ㄧ湡瀹?LLM */
  foundationMock: {
    global: false,
    phases: { planning: true, foundation: true },
  } as MockConfig,

  /** 浠呰鍥鹃樁娈电敤鐪熷疄 LLM锛堣皟璇曠粍浠?椤甸潰鐢熸垚锛?*/
  viewReal: {
    global: true,
    phases: { view: false },
  } as MockConfig,

  /** 浠呮渶鍚庣粍瑁呴樁娈电敤鐪熷疄 LLM */
  assemblyReal: {
    global: true,
    phases: { assembly: false },
  } as MockConfig,
} as const;

function parseMockNodes(value = ""): Partial<Record<NodeName, boolean>> {
  const nodes: Partial<Record<NodeName, boolean>> = {};

  for (const nodeName of value.split(",")) {
    const trimmed = nodeName.trim();
    if (!trimmed) continue;

    if ((ALL_NODES as string[]).includes(trimmed)) {
      nodes[trimmed as NodeName] = true;
    } else {
      console.warn(`[MockConfig] Ignoring unknown mock node: ${trimmed}`);
    }
  }

  return nodes;
}

const envMockNodes = parseMockNodes(process.env.MOCK_NODES);

/**
 * 褰撳墠浣跨敤鐨勯粯璁ら厤缃? * 淇敼杩欓噷鏉ュ垏鎹㈠叏灞€榛樿琛屼负
 */
export const DEFAULT_MOCK_PRESET: MockConfig =
  process.env.MOCK_MODE === "true"
    ? MOCK_PRESETS.allMock
    : Object.keys(envMockNodes).length > 0
      ? { global: false, nodes: envMockNodes }
      : MOCK_PRESETS.allReal;


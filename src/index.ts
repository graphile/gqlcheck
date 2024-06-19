export {
  SourceLike,
  SourceResultsBySourceName as SourceResultBySourceName,
  CheckOperationsResult,
  Baseline,
} from "./interfaces.js";
export { checkOperations } from "./main.js";
export { printResults } from "./print.js";
export { filterBaseline, generateBaseline } from "./baseline.js";

declare global {
  namespace GraphileConfig {
    interface Preset {
      opcheck?: {
        workerCount?: number;
        schemaSdlPath?: string;
        operationOverrides?: {
          [operationName: string]: GraphileConfig.OpcheckRuleConfig;
        };
        config?: GraphileConfig.OpcheckRuleConfig;
      };
    }
    interface OpcheckRuleConfig {
      maxDepth?: number;
      maxListDepth?: number;
      maxSelfReferentialDepth?: number;
      maxIntrospectionDepth?: number;
      maxIntrospectionListDepth?: number;
      maxIntrospectionSelfReferentialDepth?: number;
      maxDepthByFieldCoordinates?: {
        [fieldCoordinate: string]: number;
      };
    }
  }
}

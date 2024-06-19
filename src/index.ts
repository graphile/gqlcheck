export { SourceLike, Results } from "./interfaces.js";
export { checkOperations } from "./main.js";

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

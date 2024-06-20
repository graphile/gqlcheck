export { filterBaseline, generateBaseline } from "./baseline.js";
export {
  Baseline,
  CheckOperationsResult,
  SourceLike,
  SourceResultsBySourceName as SourceResultBySourceName,
} from "./interfaces.js";
export { checkOperations } from "./main.js";
export { printResults } from "./print.js";

declare global {
  namespace GraphileConfig {
    interface Preset {
      gqlcheck?: {
        workerCount?: number;
        baselinePath?: string;
        schemaSdlPath?: string;
        operationOverrides?: {
          [operationName: string]: GraphileConfig.GraphQLCheckConfig;
        };
        config?: GraphileConfig.GraphQLCheckConfig;
      };
    }
    interface GraphQLCheckConfig {
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

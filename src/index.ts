export { checkOperations } from "./main";

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
      maxIntrospectionDepth?: number;
      maxIntrospectionListDepth?: number;
    }
  }
}

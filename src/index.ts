export { checkOperations } from "./main";

declare global {
  namespace GraphileConfig {
    interface Preset {
      opcheck?: {
        workerCount?: number;
        schemaSdlPath?: string;
        overrides?: {
          [coordinate: string]: GraphileConfig.OpcheckRuleConfig;
        };
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

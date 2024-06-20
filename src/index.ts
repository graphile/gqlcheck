import "graphile-config";
import { CallbackOrDescriptor, MiddlewareNext } from "graphile-config";
import { CheckDocumentEvent, CheckDocumentOutput } from "./interfaces.js";

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

    interface Plugin {
      gqlcheck?: {
        middleware?: {
          [key in keyof GqlcheckMiddleware]?: CallbackOrDescriptor<
            GqlcheckMiddleware[key] extends (
              ...args: infer UArgs
            ) => infer UResult
              ? (next: MiddlewareNext<UResult>, ...args: UArgs) => UResult
              : never
          >;
        };
      };
    }

    interface GqlcheckMiddleware {
      checkDocument(
        event: CheckDocumentEvent,
      ): PromiseLike<CheckDocumentOutput>;
    }
  }
}

export type PromiseOrDirect<T> = PromiseLike<T> | T;
export type TruePromiseOrDirect<T> = Promise<T> | T;

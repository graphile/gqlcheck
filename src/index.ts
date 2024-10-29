import type { CallbackOrDescriptor, MiddlewareNext } from "graphile-config";
import type { ASTVisitor, GraphQLError } from "graphql";

import type {
  CheckDocumentEvent,
  CheckDocumentOutput,
  CreateVisitorEvent,
  ValidateEvent,
  VisitorsEvent,
} from "./interfaces.js";

export {
  filterBaseline,
  filterOnlyErrors,
  generateBaseline,
  sortBaseline,
} from "./baseline.js";
export {
  Baseline,
  CheckOperationsResult,
  SourceLike,
  SourceResultsBySourceName as SourceResultBySourceName,
} from "./interfaces.js";
export { checkOperations } from "./main.js";
export { printResults } from "./print.js";
export { RuleError } from "./ruleError.js";
export { RulesContext } from "./rulesContext.js";

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
      validate(
        event: ValidateEvent,
      ): PromiseOrDirect<ReadonlyArray<GraphQLError>>;
      checkDocument(
        event: CheckDocumentEvent,
      ): PromiseLike<CheckDocumentOutput>;
      visitors(event: VisitorsEvent): PromiseOrDirect<ASTVisitor[]>;
      createVisitor(event: CreateVisitorEvent): PromiseOrDirect<ASTVisitor>;
    }
  }
}
export type PromiseOrDirect<T> = PromiseLike<T> | T;
export type TruePromiseOrDirect<T> = Promise<T> | T;

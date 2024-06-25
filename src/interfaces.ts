import type {
  ASTNode,
  ASTVisitor,
  DocumentNode,
  GraphQLFormattedError,
  GraphQLSchema,
  validate,
  ValidationRule,
} from "graphql";

import type { RulesContext } from "./rulesContext";

export interface WorkerData {
  configPath: string | null | undefined;
  overrideConfig: GraphileConfig.Preset["gqlcheck"] | undefined;
}

export interface CheckDocumentRequest {
  sourceName: string;
  sourceString: string;
}

export type CheckDocumentCounts = {
  [key in ASTNode["kind"]]?: number;
};

export interface CheckDocumentOutput {
  sourceName: string;
  errors: (GraphQLFormattedError | RuleFormattedError)[];
  operations: ReadonlyArray<CheckDocumentOperationResult>;
  filtered: number;
  meta: {
    count?: CheckDocumentCounts;
  };
}

export interface CheckDocumentOperationResult {
  operationName: string | undefined;
  operationKind: "query" | "mutation" | "subscription";
}

export interface SourceLike {
  body: string;
  name: string;
}

export interface SourceResultsBySourceName {
  [sourceName: string]: {
    sourceString: string;
    output: CheckDocumentOutput;
  };
}

export interface RuleFormattedError extends GraphQLFormattedError {
  infraction: string;
  operations: ReadonlyArray<{
    operationName: string | undefined;
    operationCoordinates: ReadonlyArray<string>;
  }>;
  override: GraphileConfig.GraphQLCheckConfig;
}

export interface CheckOperationsResult {
  rawResultsBySourceName: SourceResultsBySourceName;
  resultsBySourceName: SourceResultsBySourceName;
  baseline: Baseline | null;
  resolvedPreset: GraphileConfig.ResolvedPreset;
  counts: CheckDocumentCounts;
}

export interface Baseline {
  version: 1;
  operations: {
    [operationName: string]:
      | {
          ignoreCoordinatesByRule: {
            [infraction: string]: string[] | undefined;
          };
        }
      | undefined;
  };
}

export interface CheckDocumentEvent {
  req: CheckDocumentRequest;
}
export interface VisitorsEvent {
  rulesContext: RulesContext;
  visitors: ASTVisitor[];
}
export interface CreateVisitorEvent {
  rulesContext: RulesContext;
  visitors: ASTVisitor[];
}
export interface ErrorOperationLocation {
  operationName: string | undefined;
  operationCoordinates: string[];
}
export interface ValidateEvent {
  validate: typeof validate;
  schema: GraphQLSchema;
  document: DocumentNode;
  rulesContext: RulesContext;
  validationRules: ValidationRule[];
  options: {
    maxErrors?: number;
  };
}

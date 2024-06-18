import { GraphQLFormattedError, ValidationContext } from "graphql";

export interface WorkerData {
  configPath: string | null | undefined;
}

export interface CheckDocumentRequest {
  sourceName: string;
  sourceString: string;
}

export interface CheckDocumentResult {
  sourceName: string;
  errors: (GraphQLFormattedError | RuleFormattedError)[];
  operations: ReadonlyArray<CheckDocumentOperationResult>;
}

export interface CheckDocumentOperationResult {
  operationName: string | undefined;
  operationKind: "query" | "mutation" | "subscription";
  issues: ReadonlyArray<Issue>;
}

export interface Issue {
  lineNumber: number;
  columnNumber: number;
  ruleName: string;
  operationCoordinate: string;
  /** What needs to be added to the overrides for this coordinate for this error to be ignored? */
  override: {};
  /** e.g. "Depth 12 exceeds maximum depth 8" */
  message: string;
  /** e.g. `Paths:\n- allFoo>nodes>bars>qu>...\n- allBars>nodes>...` */
  details?: string;
}

export interface SourceLike {
  body: string;
  name: string;
}

export interface Results {
  [sourceName: string]: {
    sourceString: string;
    result: CheckDocumentResult;
  };
}

export interface RuleFormattedError extends GraphQLFormattedError {
  ruleName: string;
  operationName: string | undefined;
  operationCoordinates: string[];
  override: GraphileConfig.OpcheckRuleConfig;
}

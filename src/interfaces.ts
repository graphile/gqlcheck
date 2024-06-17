import { DepthByCoordinate } from "@graphile/depth-limit";

export interface WorkerData {
  configPath: string | null | undefined;
}

export interface CheckDocumentRequest {
  sourceName: string;
  sourceString: string;
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

export interface CheckDocumentOperationResult {
  operationName: string | undefined;
  operationKind: "query" | "mutation" | "subscription";
  issues: ReadonlyArray<Issue>;
}

export interface CheckDocumentResult {
  errors: string[];
  operations: ReadonlyArray<CheckDocumentOperationResult>;
}

export interface SourceLike {
  body: string;
  name: string;
}

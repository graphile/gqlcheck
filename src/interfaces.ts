import { GraphQLFormattedError } from "graphql";

export interface WorkerData {
  configPath: string | null | undefined;
  overrideConfig: GraphileConfig.Preset["doccheck"] | undefined;
}

export interface CheckDocumentRequest {
  sourceName: string;
  sourceString: string;
}

export interface CheckDocumentOutput {
  sourceName: string;
  errors: (GraphQLFormattedError | RuleFormattedError)[];
  operations: ReadonlyArray<CheckDocumentOperationResult>;
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
  operationName: string | undefined;
  operationCoordinates: string[];
  override: GraphileConfig.DoccheckRuleConfig;
}

export interface CheckOperationsResult {
  rawResultsBySourceName: SourceResultsBySourceName;
  resultsBySourceName: SourceResultsBySourceName;
  baseline: Baseline | null;
  resolvedPreset: GraphileConfig.ResolvedPreset;
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

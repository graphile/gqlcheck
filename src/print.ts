import { GraphQLFormattedError } from "graphql";
import {
  Issue,
  SourceResultsBySourceName,
  RuleFormattedError,
  CheckOperationsResult,
} from "./interfaces.js";

function printGraphQLFormattedErrorLocations(
  error: GraphQLFormattedError,
): string {
  if (error.locations?.length) {
    const first = error.locations[0];
    return `[${first.line}:${first.column}] `;
  } else {
    return "";
  }
}

function printGraphQLFormattedError(error: GraphQLFormattedError) {
  return `${printGraphQLFormattedErrorLocations(error)}${error.message}`;
}
function printRuleFormattedError(error: RuleFormattedError) {
  return `${printGraphQLFormattedErrorLocations(error)}${error.message}\nProblematic paths:\n- ${error.operationCoordinates.slice(0, 10).join("\n- ")}${error.operationCoordinates.length > 10 ? "\n- ..." : ""}`;
}

function printIssue(
  issue: Issue,
  op: {
    operationName: string | undefined;
    operationKind: "query" | "mutation" | "subscription";
  },
  detailed: boolean,
) {
  const {
    lineNumber,
    columnNumber,
    message,
    ruleName,
    details,
    operationCoordinate,
  } = issue;
  const base = `[${lineNumber}:${columnNumber}@${operationCoordinate}] ${message} (${ruleName})`;
  if (detailed && details) {
    return base + "\n" + details;
  } else {
    return base;
  }
}

export function printResults(result: CheckOperationsResult, detailed = false) {
  const results = result.resultsBySourceName;
  const parts = Object.entries(results)
    .sort((a, z) => a[0].localeCompare(z[0], "en-US"))
    .map(([sourceName, spec]) => {
      const { output } = spec;
      const items: string[] = [];
      if (output.errors) {
        for (const error of output.errors) {
          if ("ruleName" in error) {
            items.push(printRuleFormattedError(error));
          } else {
            items.push(printGraphQLFormattedError(error));
          }
        }
      }
      if (output.operations) {
        // What if we have fragment rules? Should it always be operation-centric?
        for (const op of output.operations) {
          const { operationKind, operationName, issues } = op;
          for (const issue of issues) {
            items.push(printIssue(issue, op, detailed));
          }
        }
      }
      if (items.length > 0) {
        return `${sourceName}:\n${items.map((i) => `- ${i.replace(/\n/g, "\n  ")}`).join("\n")}`;
      } else {
        return null;
      }
    })
    .filter(Boolean);
  return parts.join("\n\n");
}

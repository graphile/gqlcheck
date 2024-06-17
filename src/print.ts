import { GraphQLFormattedError } from "graphql";
import { Issue, Results } from "./interfaces.js";

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

export function printResults(results: Results, detailed = false) {
  const parts = Object.entries(results)
    .sort((a, z) => a[0].localeCompare(z[0], "en-US"))
    .map(([sourceName, spec]) => {
      const { result } = spec;
      const items: string[] = [];
      if (result.errors) {
        for (const error of result.errors) {
          items.push(printGraphQLFormattedError(error));
        }
      }
      if (result.operations) {
        // What if we have fragment rules? Should it always be operation-centric?
        for (const op of result.operations) {
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

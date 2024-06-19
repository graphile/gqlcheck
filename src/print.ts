import { GraphQLFormattedError } from "graphql";
import { RuleFormattedError, CheckOperationsResult } from "./interfaces.js";

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

export function printResults(result: CheckOperationsResult, detailed = false) {
  const results = result.resultsBySourceName;
  const parts = Object.entries(results)
    .sort((a, z) => a[0].localeCompare(z[0], "en-US"))
    .map(([sourceName, spec]) => {
      const { output } = spec;
      const items: string[] = [];
      if (output.errors) {
        for (const error of output.errors) {
          if ("infraction" in error) {
            items.push(printRuleFormattedError(error));
          } else {
            items.push(printGraphQLFormattedError(error));
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

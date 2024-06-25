import type { GraphQLFormattedError } from "graphql";

import type {
  CheckOperationsResult,
  RuleFormattedError,
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
  const opCoords = error.operations.flatMap((o) => o.operationCoordinates);
  return `${printGraphQLFormattedErrorLocations(error)}${error.message}\nProblematic paths:\n- ${opCoords.slice(0, 10).join("\n- ")}${opCoords.length > 10 ? "\n- ..." : ""}`;
}

function printCounts(result: CheckOperationsResult) {
  return Object.entries(result.counts)
    .sort((a, z) => a[0].localeCompare(z[0], "en-US"))
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
}

export function printResults(result: CheckOperationsResult, _detailed = false) {
  return generateOutputAndCounts(result).output;
}

export function generateOutputAndCounts(
  result: CheckOperationsResult,
  _detailed = false,
): {
  output: string;
  errors: number;
  infractions: number;
} {
  const results = result.resultsBySourceName;
  let errors = 0;
  let infractions = 0;
  const parts = Object.entries(results)
    .sort((a, z) => a[0].localeCompare(z[0], "en-US"))
    .map(([sourceName, spec]) => {
      const { output } = spec;
      const items: string[] = [];
      if (output.errors) {
        for (const error of output.errors) {
          if ("infraction" in error) {
            infractions++;
            items.push(printRuleFormattedError(error));
          } else {
            errors++;
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
  return {
    output: `
${parts.join("\n\n")}

Visited:
${printCounts(result)}

Errors: ${errors}
Infractions: ${infractions}
`.trim(),
    errors,
    infractions,
  };
}

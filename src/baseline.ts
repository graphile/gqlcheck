import { Baseline, CheckOperationsResult } from "./interfaces";

export function generateBaseline(result: CheckOperationsResult): Baseline {
  const baseline: Baseline = {
    version: 1,
    operations: {},
  };
  for (const [sourceName, { output }] of Object.entries(
    result.resultsBySourceName,
  )) {
    const { errors } = output;
    for (const error of errors) {
      if ("ruleName" in error) {
        // Rule error
        const { operationName, ruleName, operationCoordinates } = error;
        if (!operationName) continue;
        if (!baseline.operations[operationName]) {
          baseline.operations[operationName] = {
            ignoreCoordinatesByRule: Object.create(null),
          };
        }
        const op = baseline.operations[operationName];
        if (!op.ignoreCoordinatesByRule[ruleName]) {
          op.ignoreCoordinatesByRule[ruleName] = [];
        }
        const ignores = op.ignoreCoordinatesByRule[ruleName];
        for (const coord of operationCoordinates) {
          ignores.push(coord);
        }
      }
    }
  }

  return baseline;
}

export function filterBaseline(
  baseline: Baseline,
  result: CheckOperationsResult,
): {
  result: CheckOperationsResult;
} {
  return { result };
}

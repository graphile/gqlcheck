import {
  Baseline,
  CheckDocumentOutput,
  CheckOperationsResult,
} from "./interfaces";

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

function filterOutput(
  baseline: Baseline,
  output: CheckDocumentOutput,
): CheckDocumentOutput {
  const { operations, errors: rawErrors, sourceName } = output;

  const errors = rawErrors
    .map((e) => {
      if ("ruleName" in e) {
        const { ruleName, operationName, operationCoordinates: rawCoords } = e;
        if (!operationName) {
          return e;
        }
        if (!baseline.operations[operationName]) {
          return e;
        }
        const ignores =
          baseline.operations[operationName].ignoreCoordinatesByRule[ruleName];
        if (!ignores) {
          return e;
        }
        const operationCoordinates = rawCoords.filter(
          (c) => !ignores.includes(c),
        );
        if (operationCoordinates.length === 0) {
          // Fully ignored
          return null;
        }
        return {
          ...e,
          operationCoordinates,
        };
      } else {
        return e;
      }
    })
    .filter((e) => e != null);

  return {
    ...output,
    operations,
    sourceName,
    errors,
  };
}

export function filterBaseline(
  baseline: Baseline,
  originalResult: CheckOperationsResult,
): {
  result: CheckOperationsResult;
} {
  const { resultsBySourceName: raw } = originalResult;
  const entries = Object.entries(raw)
    .map(([sourceName, { output: rawOutput, sourceString }]) => {
      const output = filterOutput(baseline, rawOutput);
      if (output === null) {
        return null;
      }
      return [sourceName, { output, sourceString }];
    })
    .filter((e) => e != null);
  const result: CheckOperationsResult = {
    resultsBySourceName: Object.fromEntries(entries),
  };
  return { result };
}

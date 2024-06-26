import type {
  Baseline,
  CheckDocumentOutput,
  CheckOperationsResult,
  SourceResultsBySourceName,
} from "./interfaces";

export function generateBaseline(
  resultsBySourceName: SourceResultsBySourceName,
): Baseline {
  const baseline: Baseline = {
    version: 1,
    operations: {},
  };
  for (const [_sourceName, { output }] of Object.entries(resultsBySourceName)) {
    const { errors } = output;
    for (const error of errors) {
      if ("infraction" in error) {
        // Rule error
        const { operations, infraction } = error;
        if (!operations) continue;
        for (const { operationName, operationCoordinates } of operations) {
          if (!operationName) continue;
          if (!baseline.operations[operationName]) {
            baseline.operations[operationName] = {
              ignoreCoordinatesByRule: Object.create(null),
            };
          }
          const op = baseline.operations[operationName];
          if (!op.ignoreCoordinatesByRule[infraction]) {
            op.ignoreCoordinatesByRule[infraction] = [];
          }
          const ignores = op.ignoreCoordinatesByRule[infraction];
          for (const coord of operationCoordinates) {
            if (!ignores.includes(coord)) {
              ignores.push(coord);
            }
          }
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
  const { errors: rawErrors } = output;
  let filtered = 0;

  const errors = rawErrors
    .map((e) => {
      if ("infraction" in e) {
        const { infraction, operations: rawOperations } = e;
        if (!rawOperations) {
          return e;
        }
        const operations = rawOperations
          .map((op) => {
            const { operationName, operationCoordinates: rawCoords } = op;
            if (operationName == null) {
              return op;
            }
            const ignores =
              baseline.operations[operationName]?.ignoreCoordinatesByRule[
                infraction
              ] ?? [];
            if (ignores.length === 0) {
              return op;
            }
            const operationCoordinates = rawCoords.filter(
              (c) => !ignores.includes(c),
            );
            if (operationCoordinates.length === 0) {
              // Fully ignored
              return null;
            }
            op.operationCoordinates = operationCoordinates;
            return op;
          })
          .filter((o) => o != null);
        if (operations.length === 0) {
          filtered++;
          return null;
        } else {
          e.operations = operations;
          return e;
        }
      } else {
        return e;
      }
    })
    .filter((e) => e != null);

  return {
    ...output,
    errors,
    filtered,
  };
}

function filterOutputOnlyErrors(
  output: CheckDocumentOutput,
): CheckDocumentOutput {
  const { errors: rawErrors } = output;
  let filtered = 0;

  const errors = rawErrors
    .map((e) => {
      if ("infraction" in e) {
        filtered++;
        return null;
      } else {
        return e;
      }
    })
    .filter((e) => e != null);

  return {
    ...output,
    errors,
    filtered,
  };
}

export function filterBaseline(
  baseline: Baseline,
  result: CheckOperationsResult,
): CheckOperationsResult {
  let filtered = 0;
  const entries = Object.entries(result.rawResultsBySourceName)
    .map(([sourceName, { output: rawOutput, sourceString }]) => {
      const output = filterOutput(baseline, rawOutput);
      filtered += output.filtered;
      return [sourceName, { output, sourceString }];
    })
    .filter((e) => e != null);
  const resultsBySourceName = Object.fromEntries(entries);
  return {
    ...result,
    baseline,
    resultsBySourceName,
    filtered,
  };
}

export function filterOnlyErrors(
  result: CheckOperationsResult,
): CheckOperationsResult {
  let filtered = 0;
  const entries = Object.entries(result.rawResultsBySourceName)
    .map(([sourceName, { output: rawOutput, sourceString }]) => {
      const output = filterOutputOnlyErrors(rawOutput);
      filtered += output.filtered;
      return [sourceName, { output, sourceString }];
    })
    .filter((e) => e != null);
  const resultsBySourceName = Object.fromEntries(entries);
  return {
    ...result,
    resultsBySourceName,
    filtered,
  };
}

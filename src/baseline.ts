import type {
  Baseline,
  CheckDocumentOutput,
  SourceResultsBySourceName,
} from "./interfaces";

export function generateBaseline(
  resultsBySourceName: SourceResultsBySourceName,
): Baseline {
  const baseline: Baseline = {
    version: 1,
    operations: {},
  };
  for (const [sourceName, { output }] of Object.entries(resultsBySourceName)) {
    const { errors } = output;
    for (const error of errors) {
      if ("infraction" in error) {
        // Rule error
        const { operationName, infraction, operationCoordinates } = error;
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
  const { errors: rawErrors } = output;

  const errors = rawErrors
    .map((e) => {
      if ("infraction" in e) {
        const {
          infraction,
          operationName,
          operationCoordinates: rawCoords,
        } = e;
        if (!operationName) {
          return e;
        }
        if (!baseline.operations[operationName]) {
          return e;
        }
        const ignores =
          baseline.operations[operationName].ignoreCoordinatesByRule[
            infraction
          ];
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
    errors,
  };
}

export function filterBaseline(
  baseline: Baseline,
  raw: SourceResultsBySourceName,
): SourceResultsBySourceName {
  const entries = Object.entries(raw)
    .map(([sourceName, { output: rawOutput, sourceString }]) => {
      const output = filterOutput(baseline, rawOutput);
      if (output === null) {
        return null;
      }
      return [sourceName, { output, sourceString }];
    })
    .filter((e) => e != null);
  return Object.fromEntries(entries);
}

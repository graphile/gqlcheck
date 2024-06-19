import { Baseline, CheckOperationsResult } from "./interfaces";

export function generateBaseline(result: CheckOperationsResult): Baseline {
  return {
    version: 1,
    operations: {},
  };
}

export function filterBaseline(
  baseline: Baseline,
  result: CheckOperationsResult,
): {
  result: CheckOperationsResult;
} {
  return { result };
}

// @ts-check

import {
  checkOperations,
  filterBaseline,
  generateBaseline,
} from "../../dist/index.js";
import { it } from "node:test";
import { getDirHelpers } from "../common.mjs";

const __dirname = new URL(".", import.meta.url).pathname;

it("depth-limit basics", async () => {
  const { getDocuments, configPath, checkResult } =
    await getDirHelpers(__dirname);
  const result = await checkOperations(getDocuments, configPath);
  await checkResult(result);
});

it("depth-limit basics with custom baseline", async () => {
  const { getDocuments, configPath, checkResult } =
    await getDirHelpers(__dirname);
  const result = await checkOperations(getDocuments, configPath, {
    baselinePath: `${__dirname}/baseline.json5`,
  });
  await checkResult(result, "custom-baseline");
});

it("depth-limit basics with full baseline", async () => {
  const { getDocuments, configPath, checkResult } =
    await getDirHelpers(__dirname);
  const result = await checkOperations(getDocuments, configPath);
  const baseline = generateBaseline(result.rawResultsBySourceName);
  result.resultsBySourceName = filterBaseline(
    baseline,
    result.resultsBySourceName,
  );
  await checkResult(result, "full-baseline");
});

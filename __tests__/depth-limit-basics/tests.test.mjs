// @ts-check

import { it } from "node:test";

import {
  checkOperations,
  filterBaseline,
  generateBaseline,
} from "../../dist/index.js";
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
  const filteredResult = filterBaseline(baseline, result);
  await checkResult(filteredResult, "full-baseline");
});

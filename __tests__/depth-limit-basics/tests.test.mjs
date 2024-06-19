// @ts-check

import JSON5 from "json5";
import {
  checkOperations,
  filterBaseline,
  generateBaseline,
} from "../../dist/index.js";
import { it } from "node:test";
import { getDirHelpers } from "../common.mjs";
import { readFile } from "node:fs/promises";

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
  const result = await checkOperations(getDocuments, configPath);
  /** @type {import("../../dist/interfaces.js").Baseline} */
  const baseline = JSON5.parse(
    await readFile(`${__dirname}/baseline.json5`, "utf8"),
  );
  const { result: filteredResult } = filterBaseline(baseline, result);
  await checkResult(filteredResult, "custom-baseline");
});

it("depth-limit basics with full baseline", async () => {
  const { getDocuments, configPath, checkResult } =
    await getDirHelpers(__dirname);
  const result = await checkOperations(getDocuments, configPath);
  const baseline = generateBaseline(result);
  const { result: filteredResult } = filterBaseline(baseline, result);
  await checkResult(filteredResult, "full-baseline");
});

// @ts-check

import { it } from "node:test";

import { checkOperations } from "../../dist/index.js";
import { getDirHelpers } from "../common.mjs";

const __dirname = new URL(".", import.meta.url).pathname;

it("depth-limit for large schema", async () => {
  const { getDocuments, configPath, checkResult } =
    await getDirHelpers(__dirname);
  const result = await checkOperations(getDocuments, configPath);
  await checkResult(result);
});

// @ts-check

import { checkOperations } from "../../dist/index.js";
import { it } from "node:test";
import { getDirHelpers } from "../common.mjs";

const __dirname = new URL(".", import.meta.url).pathname;

it("works", async () => {
  const { getDocuments, configPath, checkResult } =
    await getDirHelpers(__dirname);
  const result = await checkOperations(getDocuments, configPath);
  await checkResult(result);
});

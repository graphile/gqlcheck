#!/usr/bin/env node
import { parseArgs } from "node:util";
import { checkOperations } from "./main";
import { open } from "node:fs/promises";
import { kjsonlLines } from "kjsonl";

const { values, positionals } = parseArgs({
  options: {
    config: {
      type: "string",
      short: "C",
      // description: "The path to the config file",
    },
  },
  allowPositionals: true,
  strict: true,
});

async function* getOperations() {
  const KJSONL_FILE_PATH = positionals[0] ?? "./documents.kjsonl";
  const handle = await open(KJSONL_FILE_PATH, "r");
  for await (const line of kjsonlLines(handle)) {
    const hash = line.keyBuffer.toString("utf8");
    const value = JSON.parse(line.valueBuffer.toString("utf8"));
    const sourceString = typeof value === "string" ? value : value.document;
    yield { body: sourceString, name: hash };
  }
  await handle.close();
}

async function main() {
  const results = await checkOperations(getOperations, values.config);
  console.dir(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

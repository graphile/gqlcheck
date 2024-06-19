#!/usr/bin/env node
import { parseArgs } from "node:util";
import { checkOperations } from "./main";
import { open, readdir, stat, readFile } from "node:fs/promises";
import { kjsonlLines } from "kjsonl";
import { SourceLike } from "./interfaces";
import { printResults } from "./print.js";

const { values, positionals } = parseArgs({
  options: {
    config: {
      type: "string",
      short: "C",
      // description: "The path to the config file",
    },
    "update-baseline": {
      type: "boolean",
      short: "u",
      // description: "Update the baseline.json file to allow all passed documents even if they break the rules."
    },
    schema: {
      type: "string",
      short: "s",
      // description: "Path to the GraphQL schema SDL file"
    },
  },
  allowPositionals: true,
  strict: true,
});

async function* getOperationsFromKJSONL(
  path: string,
): AsyncIterableIterator<SourceLike> {
  const handle = await open(path, "r");
  try {
    for await (const line of kjsonlLines(handle)) {
      const hash = line.keyBuffer.toString("utf8");
      const value = JSON.parse(line.valueBuffer.toString("utf8"));
      const sourceString = typeof value === "string" ? value : value.document;
      yield { body: sourceString, name: hash };
    }
  } finally {
    await handle.close();
  }
}

async function* getOperationsFromPath(
  path: string,
): AsyncIterableIterator<SourceLike> {
  const stats = await stat(path);

  if (stats.isDirectory()) {
    const files = await readdir(path);
    for (const file of files) {
      if (!file.startsWith(".")) {
        yield* getOperationsFromPath(path + "/" + file);
      }
    }
  } else {
    if (path.endsWith(".graphql")) {
      const body = await readFile(path, "utf8");
      yield { body, name: path };
    } else if (path.endsWith(".kjsonl")) {
      yield* getOperationsFromKJSONL(path);
    } else {
      // TODO: move this to warnings
      throw new Error(`Path '${path}' not understood`);
    }
  }
}

async function* getOperations(): AsyncIterableIterator<SourceLike> {
  for (const positional of positionals) {
    yield* getOperationsFromPath(positional);
  }
}

async function main() {
  const conf: GraphileConfig.Preset["opcheck"] = {
    ...(values.schema ? { schemaSdlPath: values.schema } : null),
  };
  const result = await checkOperations(getOperations, values.config, conf);
  console.log(printResults(result));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

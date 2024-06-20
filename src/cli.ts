#!/usr/bin/env node
import { open, readdir, readFile, stat, writeFile } from "node:fs/promises";
import type { ParseArgsConfig } from "node:util";
import { parseArgs } from "node:util";

import JSON5 from "json5";
import { kjsonlLines } from "kjsonl";

import { filterBaseline, generateBaseline } from "./baseline";
import type { SourceLike } from "./interfaces";
import { checkOperations } from "./main";
import { printResults } from "./print.js";
import { version } from "./version";

const parseArgsConfig = {
  options: {
    help: {
      type: "boolean",
      placeholder: undefined,
      short: "h",
      description: "Output available CLI flags",
    },
    version: {
      type: "boolean",
      placeholder: undefined,
      short: "v",
      description: "Output the version",
    },
    config: {
      type: "string",
      placeholder: "configPath",
      short: "C",
      description: "The path to the config file",
    },
    schema: {
      type: "string",
      placeholder: "sdlPath",
      short: "s",
      description: "Path to the GraphQL schema SDL file",
    },
    baseline: {
      type: "string",
      placeholder: "jsonPath",
      short: "b",
      description: "Path to the baseline file (.json or .json5)",
    },
    "update-baseline": {
      type: "boolean",
      placeholder: undefined,
      short: "u",
      description:
        "Update the baseline.json file to allow all passed documents even if they break the rules.",
    },
  },
  allowPositionals: true,
  strict: true,
} satisfies ParseArgsConfig & {
  options: {
    [optionName: string]: { description?: string; placeholder?: string };
  };
};

const { values, positionals } = parseArgs(parseArgsConfig);

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

function printArg<TKey extends keyof (typeof parseArgsConfig)["options"]>([
  name,
  value,
]: [name: TKey, value: (typeof parseArgsConfig)["options"][TKey]]): string {
  const { type, short, description, placeholder } = value;
  return `
--${name}${type === "boolean" ? "" : ` <${placeholder}>`}\
${short ? `\n-${short}${type === "boolean" ? "" : ` <${placeholder}>`}` : ""}\
${
  description
    ? `

    ${description?.replace(/\n/g, "\n    ")}`
    : ""
}
`.trim();
}

async function main() {
  if (values.help) {
    console.log(
      `
Usage:

  gqlcheck [-s schema.graphqls] [-b baseline.json5] [-u] doc1.graphql doc2.graphql

Flags:

${(Object.entries(parseArgsConfig.options) as Array<[key: keyof (typeof parseArgsConfig)["options"], value: (typeof parseArgsConfig)["options"][keyof (typeof parseArgsConfig)["options"]]]>).map(printArg).join("\n\n")}
`.trim(),
    );
    return;
  }
  if (values.version) {
    console.log("v" + version);
    return;
  }
  const conf: GraphileConfig.Preset["gqlcheck"] = {
    ...(values.schema ? { schemaSdlPath: values.schema } : null),
    ...(values.baseline ? { baselinePath: values.baseline } : null),
  };
  const result = await checkOperations(getOperations, values.config, conf);
  if (values["update-baseline"]) {
    const baselinePath = result.resolvedPreset.gqlcheck?.baselinePath;
    if (!baselinePath) {
      throw new Error(
        `--update-baseline was specified without --baseline, and no preset.gqlcheck.baselinePath was found in your configuration; aborting.`,
      );
    }
    const newBaseline = generateBaseline(result.rawResultsBySourceName);
    const data = baselinePath.endsWith(".json5")
      ? JSON5.stringify(newBaseline, null, 2)
      : JSON.stringify(newBaseline, null, 2);
    await writeFile(baselinePath, data + "\n");
    result.baseline = newBaseline;
    result.resultsBySourceName = filterBaseline(
      newBaseline,
      result.rawResultsBySourceName,
    );
  }
  console.log(printResults(result));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

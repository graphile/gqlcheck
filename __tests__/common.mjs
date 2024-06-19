// @ts-check

import { diff } from "jest-diff";
import assert from "assert";
import { readdir, readFile, writeFile } from "fs/promises";
import JSON5 from "json5";

/** @import { SourceLike, CheckOperationsResult } from '../dist/index.js' */

const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === "1";

/** @typedef {{
 *   getDocuments: () => AsyncIterableIterator<SourceLike>,
 *   configPath: string,
 *   checkResult: (result: CheckOperationsResult) => Promise<void>,
 * }} DirHelpers */
/** @type {(dirname: string) => Promise<DirHelpers>} */
export async function getDirHelpers(dirname) {
  const documentsDir = `${dirname}/documents`;
  const configPath = `${dirname}/graphile.config.mjs`;
  const resultsFile = `${dirname}/results.json5`;
  const files = (await readdir(documentsDir)).filter((f) =>
    f.endsWith(".graphql"),
  );
  const fileContentsByName = Object.fromEntries(
    await Promise.all(
      files.map(
        /** @returns {Promise<[string, string]>} */
        async (name) => [
          name,
          await readFile(`${documentsDir}/${name}`, "utf8"),
        ],
      ),
    ),
  );
  return {
    configPath,
    async *getDocuments() {
      for (const [name, body] of Object.entries(fileContentsByName)) {
        yield { name, body };
      }
    },
    async checkResult(result) {
      // Sort the results by key
      const results = Object.fromEntries(
        Object.entries(result.resultsBySourceName)
          .sort((a, z) => a[0].localeCompare(z[0], "en-US"))
          .map(([k, { sourceString, ...rest }]) => [k, rest]),
      );
      const stringifiedResults = JSON5.stringify(results, null, 2) + "\n";
      /** @type { string | null} */
      let rawJson5;
      try {
        rawJson5 = await readFile(resultsFile, "utf8");
      } catch (e) {
        rawJson5 = null;
      }
      /** @type {(fileExisted: boolean) => Promise<void>} */
      async function writeSnapshot(fileExisted) {
        if (fileExisted && UPDATE_SNAPSHOTS) {
          console.warn(`Updated snapshot in ${resultsFile}`);
        } else if (!fileExisted) {
          console.warn(`Created snapshot ${resultsFile}`);
        }
        await writeFile(resultsFile, stringifiedResults);
      }
      if (rawJson5 !== null) {
        if (rawJson5 === stringifiedResults) {
          // No action necessary
        } else if (UPDATE_SNAPSHOTS) {
          await writeSnapshot(true);
        } else {
          throw new Error(
            `Results do not match:\n${diff(JSON5.parse(rawJson5), results)}`,
          );
        }
      } else {
        await writeSnapshot(false);
      }
    },
  };
}

// @ts-check

/** @typedef {import('./dist/index.js')} Mod */

/** @type {GraphileConfig.Preset} */
const preset = {
  opcheck: {
    schemaSdlPath: "__tests__/schema.graphql",
  },
};
export default preset;
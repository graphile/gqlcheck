// @ts-check
/** @import {} from '../../dist/index.js' */

const __dirname = new URL(".", import.meta.url).pathname;

/** @type {GraphileConfig.Preset} */
const preset = {
  gqlcheck: {
    schemaSdlPath: `${__dirname}/schema.graphqls`,
  },
};

export default preset;

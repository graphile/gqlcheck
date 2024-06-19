// @ts-check
/** @import {} from '../../dist/index.js' */

const __dirname = new URL(".", import.meta.url).pathname;

/** @type {GraphileConfig.Preset} */
const preset = {
  doccheck: {
    schemaSdlPath: `${__dirname}/schema.graphqls`,
    config: {
      maxListDepth: 5,
      maxDepth: 10,
      maxSelfReferentialDepth: 20,
    },
    operationOverrides: {
      FoFoF: {
        maxSelfReferentialDepth: 2,
      },
      FoFoFoF: {
        maxDepthByFieldCoordinates: {
          "User.friends": 3,
        },
      },
    },
  },
};

export default preset;

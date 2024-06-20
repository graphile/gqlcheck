module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/errors",
    "plugin:import/typescript",
    "prettier",
  ],
  plugins: ["tsdoc", "simple-import-sort", "import"],
  env: {
    node: true,
    es6: true,
  },
  rules: {
    // We need this for our `GraphileEngine` namespace
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/consistent-type-imports": "error",
    "no-confusing-arrow": "off",
    "no-else-return": "off",
    "no-underscore-dangle": "off",
    "no-restricted-syntax": "off",
    "no-await-in-loop": "off",
    "tsdoc/syntax": "error",

    /*
     * simple-import-sort seems to be the most stable import sorting currently,
     * disable others
     */
    "simple-import-sort/imports": "error",
    "simple-import-sort/exports": "error",
    "sort-imports": "off",
    "import/order": "off",

    "import/extensions": ["error", "ignorePackages"],
    "import/no-deprecated": "warn",

    // Apply has been more optimised than spread, use whatever feels right.
    "prefer-spread": "off",

    // note you must disable the base rule as it can report incorrect errors
    "no-duplicate-imports": "off",
    "import/no-duplicates": "error",
  },
  overrides: [
    // Rules for interfaces.ts files
    {
      files: ["**/interfaces.ts"],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            selector: "TSModuleDeclaration[kind='global']",
            message:
              "No `declare global` allowed in `interface.ts` files since these type-only files may not be imported by dependents, recommend adding to `index.ts` instead.",
          },
        ],
      },
    },

    // Rules for TypeScript only
    {
      files: ["*.ts", "*.tsx"],
      parser: "@typescript-eslint/parser",
      rules: {
        "no-dupe-class-members": "off",
        "no-undef": "off",
        // This rule doesn't understand import of './js'
        "import/no-unresolved": "off",
      },
    },

    // Rules for JavaScript only
    {
      files: ["*.js", "*.jsx", "*.mjs", "*.cjs"],
      rules: {
        "tsdoc/syntax": "off",
        "import/extensions": "off",
      },
    },

    // Stricter rules for source code
    {
      files: ["*/*/src/**/*.ts", "*/*/src/**/*.tsx"],
      parser: "@typescript-eslint/parser",
      parserOptions: {
        project: true,
      },
      rules: {},
    },

    // Rules for tests only
    {
      files: ["**/__tests__/**/*.{ts,js,mts,mjs}"],
      rules: {
        // Disable these to enable faster test writing
        "prefer-const": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "@typescript-eslint/explicit-function-return-type": "off",

        // We don't normally care about race conditions in tests
        "require-atomic-updates": "off",
      },
    },
  ],
};

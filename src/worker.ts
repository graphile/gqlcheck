import { readFileSync } from "node:fs";
import { isMainThread, parentPort, workerData } from "node:worker_threads";

import { Middleware, orderedApply, resolvePresets } from "graphile-config";
import { loadConfig } from "graphile-config/load";
import type { GraphQLError, GraphQLFormattedError } from "graphql";
import {
  buildASTSchema,
  formatError,
  Kind,
  parse,
  Source,
  specifiedRules,
  validate,
  validateSchema,
  version as graphqlVersion,
  visit,
  visitInParallel,
  visitWithTypeInfo,
} from "graphql";

import { CountVisitor } from "./CountVisitor.js";
import { DepthVisitor } from "./DepthVisitor.js";
import type {
  CheckDocumentOperationResult,
  CheckDocumentOutput,
  CheckDocumentRequest,
  RuleFormattedError,
  WorkerData,
} from "./interfaces.js";
import { TypeAndOperationPathInfo } from "./operationPaths.js";
import { OperationPathsVisitor } from "./OperationPathsVisitor.js";
import type { RuleError } from "./ruleError.js";
import { RulesContext } from "./rulesContext.js";

const graphqlVersionMajor = parseInt(graphqlVersion.split(".")[0], 10);

if (isMainThread) {
  throw new Error(
    "This script is designed to be called by `scan.ts`, but it's the main thread",
  );
}

if (!parentPort) {
  throw new Error(
    "This script is designed to be called by `scan.ts`, but there's no parent port",
  );
}
const definitelyParentPort = parentPort;

async function main() {
  const { configPath, overrideConfig } = workerData as WorkerData;
  const rawConfig = await loadConfig(configPath);
  const config = resolvePresets([
    rawConfig ?? {},
    { gqlcheck: overrideConfig },
  ]);
  const {
    gqlcheck: { schemaSdlPath = `${process.cwd()}/schema.graphql` } = {},
  } = config;

  const middleware = new Middleware<GraphileConfig.GqlcheckMiddleware>();
  orderedApply(
    config.plugins,
    (p) => p.gqlcheck?.middleware,
    (name, fn, _plugin) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      middleware.register(name, fn as any);
    },
  );

  const schemaString = readFileSync(schemaSdlPath, "utf8");
  const schema = buildASTSchema(parse(schemaString));
  {
    const schemaErrors = validateSchema(schema);
    if (schemaErrors.length) {
      console.error(schemaErrors);
      throw new Error(`GraphQL schema is invalid.`);
    }
  }

  async function checkDocument(
    req: CheckDocumentRequest,
  ): Promise<CheckDocumentOutput> {
    const { sourceString, sourceName } = req;
    const source = new Source(sourceString, sourceName);
    const document = parse(source);
    const operationDefinitions = document.definitions.filter(
      (o) => o.kind === Kind.OPERATION_DEFINITION,
    );

    const typeInfo = new TypeAndOperationPathInfo(schema);
    const errors: (RuleFormattedError | GraphQLFormattedError)[] = [];
    function onError(
      error: RuleError | (GraphQLError & { toJSONEnhanced?: undefined }),
    ) {
      errors.push(
        error.toJSONEnhanced?.(rulesContext) ??
          error.toJSON?.() ??
          // Ignore deprecated, this is for GraphQL v15 support
          formatError(error),
      );
    }
    const rulesContext = new RulesContext(
      schema,
      document,
      typeInfo,
      config,
      onError,
    );

    if (operationDefinitions.length === 0) {
      return {
        sourceName,
        operations: [],
        errors: [{ message: "Could not find any operations in this document" }],
        meta: rulesContext.getMeta(),
        filtered: 0,
      };
    }

    const validationRules = [...specifiedRules];
    const mode =
      graphqlVersionMajor === 15 ? 1 : graphqlVersionMajor === 16 ? 2 : 0;

    const validationErrors = await middleware.run(
      "validate",
      {
        validate,
        schema,
        document,
        rulesContext,
        validationRules,
        options: {},
      },
      ({
        validate,
        schema,
        document,
        rulesContext,
        validationRules,
        options,
      }) =>
        mode === 1
          ? // GraphQL v15 style
            validate(
              schema,
              document,
              [...validationRules, () => OperationPathsVisitor(rulesContext)],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              typeInfo as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              options as any,
            )
          : mode === 2
            ? // GraphQL v16 style
              validate(
                schema,
                document,
                [...validationRules, () => OperationPathsVisitor(rulesContext)],
                options,
                rulesContext.getTypeInfo(),
              )
            : // GraphQL v17 MIGHT remove typeInfo
              validate(schema, document, validationRules),
    );

    if (validationErrors.length > 0) {
      return {
        sourceName,
        operations: [],
        errors: validationErrors.map(
          (e) =>
            e.toJSON?.() ??
            // Ignore deprecated, this is for GraphQL v15 support
            formatError(e),
        ),
        meta: rulesContext.getMeta(),
        filtered: 0,
      };
    }

    if (mode === 0) {
      // Need to revisit, because OperationPathsVisitor didn't run above.
      visit(
        document,
        visitWithTypeInfo(
          rulesContext.getTypeInfo(),
          visitInParallel([OperationPathsVisitor(rulesContext)]),
        ),
      );
    }

    const visitors = await middleware.run(
      "visitors",
      {
        rulesContext,
        visitors: [CountVisitor(rulesContext), DepthVisitor(rulesContext)],
      },
      ({ visitors }) => visitors,
    );
    const visitor = await middleware.run(
      "createVisitor",
      { rulesContext, visitors },
      ({ rulesContext, visitors }) =>
        visitWithTypeInfo(
          rulesContext.getTypeInfo(),
          visitInParallel(visitors),
        ),
    );
    visit(document, visitor);

    const operations = operationDefinitions.map(
      (operationDefinition): CheckDocumentOperationResult => {
        const operationName = operationDefinition.name?.value;
        const operationKind = operationDefinition.operation;

        return {
          operationName,
          operationKind,
        };
      },
    );

    return {
      sourceName,
      errors,
      operations,
      meta: rulesContext.getMeta(),
      filtered: 0,
    };
  }

  definitelyParentPort.on("message", (req: CheckDocumentRequest | "STOP") => {
    if (req === "STOP") {
      process.exit(0);
    }
    middleware
      .run("checkDocument", { req }, ({ req }) => checkDocument(req))
      .then(
        (result) => {
          definitelyParentPort.postMessage(result);
        },
        (e) => {
          console.dir(e);
          process.exit(1);
        },
      );
  });
  definitelyParentPort.postMessage("READY");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

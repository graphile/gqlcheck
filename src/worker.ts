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
  validate,
  validateSchema,
  visit,
  visitInParallel,
  visitWithTypeInfo,
} from "graphql";

import { DepthVisitor } from "./DepthVisitor.js";
import type {
  CheckDocumentOperationResult,
  CheckDocumentOutput,
  CheckDocumentRequest,
  RuleFormattedError,
  WorkerData,
} from "./interfaces.js";
import { TypeAndOperationPathInfo } from "./operationPaths.js";
import type { RuleError } from "./ruleError.js";
import { RulesContext } from "./rulesContext.js";

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
    if (operationDefinitions.length === 0) {
      return {
        sourceName,
        operations: [],
        errors: [{ message: "Could not find any operations in this document" }],
      };
    }

    // TODO: regular validation
    const validationErrors = validate(schema, document);
    if (validationErrors.length > 0) {
      return {
        sourceName,
        operations: [],
        errors: validationErrors.map((e) => e.toJSON?.() ?? formatError(e)),
      };
    }

    const typeInfo = new TypeAndOperationPathInfo(schema);
    const errors: (RuleFormattedError | GraphQLFormattedError)[] = [];
    function onError(error: RuleError | GraphQLError) {
      errors.push(error.toJSON?.() ?? formatError(error));
    }
    const rulesContext = new RulesContext(
      schema,
      document,
      typeInfo,
      config,
      onError,
    );
    const visitor = visitInParallel([DepthVisitor(rulesContext)]);
    visit(document, visitWithTypeInfo(typeInfo, visitor));

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

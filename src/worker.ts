import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import {
  buildASTSchema,
  GraphQLError,
  GraphQLFormattedError,
  Kind,
  parse,
  Source,
  validate,
  validateSchema,
  visit,
  visitInParallel,
  visitWithTypeInfo,
} from "graphql";
import {
  CheckDocumentOperationResult,
  CheckDocumentRequest,
  CheckDocumentOutput,
  RuleFormattedError,
  WorkerData,
} from "./interfaces";
import { loadConfig } from "graphile-config/load";
import { resolvePresets } from "graphile-config";
import { TypeAndOperationPathInfo } from "./operationPaths";
import { RulesContext } from "./rulesContext";
import { DepthVisitor } from "./DepthVisitor";
import { RuleError } from "./ruleError";

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
        errors: validationErrors.map((e) => e.toJSON()),
      };
    }

    const typeInfo = new TypeAndOperationPathInfo(schema);
    const errors: (RuleFormattedError | GraphQLFormattedError)[] = [];
    function onError(error: RuleError | GraphQLError) {
      errors.push(error.toJSON());
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
    checkDocument(req).then(
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

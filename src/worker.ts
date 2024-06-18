import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { readFileSync } from "node:fs";
import {
  buildASTSchema,
  GraphQLError,
  GraphQLFormattedError,
  Kind,
  parse,
  Source,
  TypeInfo,
  validate,
  validateSchema,
  visit,
  visitInParallel,
  visitWithTypeInfo,
} from "graphql";
import {
  CheckDocumentOperationResult,
  CheckDocumentRequest,
  CheckDocumentResult,
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
  const { configPath } = workerData as WorkerData;
  const rawConfig = await loadConfig(configPath);
  const config = rawConfig ? resolvePresets([rawConfig]) : {};
  const {
    opcheck: { schemaSdlPath = `${process.cwd()}/schema.graphql` } = {},
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
  ): Promise<CheckDocumentResult> {
    const { sourceString, sourceName } = req;
    const source = new Source(sourceString, sourceName);
    const document = parse(source);
    const operationDefinitions = document.definitions.filter(
      (o) => o.kind === Kind.OPERATION_DEFINITION,
    );
    const fragmentDefinitions = document.definitions.filter(
      (d) => d.kind === "FragmentDefinition",
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

        /*
        const { depths } = countDepth(
          schema,
          operationDefinition,
          fragmentDefinitions,
          { revealDetails: true },
        );


      const maxes: Record<
        string,
        {
          val: number;
          operations: Array<{
            sourceName: string;
            operationName: string | undefined;
            sourceString: string;
          }>;
        }
      > = Object.create(null);

      if (depths) {
        if (depths.$$depth) {
          operationResult.maxDepthByHash[sourceName] = depths.$$depth;
          if (depths.$$depth > operationResult.maxDepth) {
            operationResult.maxDepth = depths.$$depth;
          }
        }
        if (depths.$$listDepth) {
          operationResult.maxListDepthByHash[sourceName] = depths.$$listDepth;
          if (depths.$$listDepth > operationResult.maxListDepth) {
            operationResult.maxListDepth = depths.$$listDepth;
          }
        }
        for (const [desc, key] of Object.entries(KEYS)) {
          const val = depths[key];
          if (val != null) {
            if (!maxes[key] || val > maxes[key].val) {
              maxes[key] = {
                val,
                operations: [{ sourceName, operationName, sourceString }],
              };
            } else if (val === maxes[key].val) {
              maxes[key].operations.push({
                sourceName,
                operationName,
                sourceString,
              });
            }
          }
        }
      }
      */
        return {
          operationName,
          operationKind,
          issues: [],
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

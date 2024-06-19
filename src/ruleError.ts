import {
  version as GraphQLVersion,
  formatError,
  GraphQLError,
  GraphQLErrorOptions,
} from "graphql";
import { RuleFormattedError } from "./interfaces";

const graphqlMajor = parseInt(GraphQLVersion.split(".")[0], 10);

export interface RuleErrorOptions extends GraphQLErrorOptions {
  infraction: string;
  operationName: string | undefined;
  operationCoordinates: string[];
  /** What needs to be added to the overrides for this coordinate for this error to be ignored? */
  override: GraphileConfig.GraphQLCheckConfig;
}

export class RuleError extends GraphQLError {
  options!: RuleErrorOptions;
  constructor(message: string, options: RuleErrorOptions) {
    if (graphqlMajor < 16) {
      // @ts-ignore
      const { nodes, source, positions, path, originalError, extensions } =
        options;
      // message, nodes, source, positions, path, originalError, extensions
      // @ts-ignore
      super(message, nodes, source, positions, path, originalError, extensions);
    } else {
      super(message, options);
    }
    try {
      this.name = "RuleError";
    } catch (e) {
      // Ignore error on GraphQL v15
    }
    Object.defineProperty(this, "options", { value: options });
  }
  toJSON(): RuleFormattedError {
    return {
      ...(super.toJSON?.() ?? formatError(this)),
      infraction: this.options.infraction,
      operationName: this.options.operationName,
      operationCoordinates: this.options.operationCoordinates,
      override: this.options.override,
    };
  }
}

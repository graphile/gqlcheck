import type { GraphQLErrorOptions } from "graphql";
import { formatError, GraphQLError, version as GraphQLVersion } from "graphql";

import type { RuleFormattedError } from "./interfaces";

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
      const { nodes, source, positions, path, originalError, extensions } =
        options;
      // message, nodes, source, positions, path, originalError, extensions
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

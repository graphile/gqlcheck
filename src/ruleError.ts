import type { GraphQLErrorOptions } from "graphql";
import { formatError, GraphQLError, version as GraphQLVersion } from "graphql";

import type { ErrorOperationLocation, RuleFormattedError } from "./interfaces";
import type { RulesContext } from "./rulesContext";

const graphqlMajor = parseInt(GraphQLVersion.split(".")[0], 10);

export interface RuleErrorOptions extends GraphQLErrorOptions {
  infraction: string;
  /** What needs to be added to the overrides for this coordinate for this error to be ignored? */
  override: GraphileConfig.GraphQLCheckConfig;
  errorOperationLocations?: readonly ErrorOperationLocation[];
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
  toJSONEnhanced(context: RulesContext): RuleFormattedError {
    return {
      ...(super.toJSON?.() ?? formatError(this)),
      infraction: this.options.infraction,
      operations:
        this.options.errorOperationLocations ??
        context.getErrorOperationLocationsForNodes(this.nodes),
      override: this.options.override,
    };
  }
}

import { GraphQLError, GraphQLErrorOptions } from "graphql";

export interface RuleErrorOptions extends GraphQLErrorOptions {
  ruleName: string;
  operationCoordinate: string;
  /** What needs to be added to the overrides for this coordinate for this error to be ignored? */
  override: {};
}

export class RuleError extends GraphQLError {
  constructor(message: string, options?: RuleErrorOptions) {
    super(message, options);
  }
}

import { GraphQLError, GraphQLErrorOptions } from "graphql";
import { RuleFormattedError } from "./interfaces";

export interface RuleErrorOptions extends GraphQLErrorOptions {
  ruleName: string;
  operationName: string | undefined;
  operationCoordinates: string[];
  /** What needs to be added to the overrides for this coordinate for this error to be ignored? */
  override: GraphileConfig.OpcheckRuleConfig;
}

export class RuleError extends GraphQLError {
  options!: RuleErrorOptions;
  constructor(message: string, options: RuleErrorOptions) {
    super(message, options);
    this.name = "RuleError";
    Object.defineProperty(this, "options", { value: options });
  }
  toJSON(): RuleFormattedError {
    return {
      ...super.toJSON(),
      ruleName: this.options.ruleName,
      operationName: this.options.operationName,
      operationCoordinates: this.options.operationCoordinates,
      override: this.options.override,
    };
  }
}

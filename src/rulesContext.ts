import {
  DocumentNode,
  GraphQLError,
  GraphQLSchema,
  ValidationContext,
} from "graphql";
import { TypeAndOperationPathInfo } from "./operationPaths";
import { RuleError } from "./ruleError";

export class RulesContext extends ValidationContext {
  constructor(
    schema: GraphQLSchema,
    ast: DocumentNode,
    private typeInfo: TypeAndOperationPathInfo,
    private resolvedPreset: GraphileConfig.ResolvedPreset,
    onError: (error: RuleError | GraphQLError) => void,
  ) {
    super(schema, ast, typeInfo, (error) => onError(error));
  }
  getOperationPath() {
    return this.typeInfo.getOperationPath();
  }
  getResolvedPreset() {
    return this.resolvedPreset;
  }
  isIntrospection() {
    return this.typeInfo.isIntrospection();
  }
}

import { DocumentNode, GraphQLSchema, ValidationContext } from "graphql";
import { TypeAndOperationPathInfo } from "./operationPaths";
import { RuleError } from "./ruleError";

export class RulesContext extends ValidationContext {
  constructor(
    schema: GraphQLSchema,
    ast: DocumentNode,
    private typeInfo: TypeAndOperationPathInfo,
    private resolvedPreset: GraphileConfig.ResolvedPreset,
    onError: (error: RuleError) => void,
  ) {
    super(schema, ast, typeInfo, onError);
  }
  getOperationPath() {
    return this.typeInfo.getOperationPath();
  }
  getResolvedPreset() {
    return this.resolvedPreset;
  }
}

import type {
  ASTNode,
  DocumentNode,
  FragmentDefinitionNode,
  FragmentSpreadNode,
  GraphQLError,
  GraphQLSchema,
  OperationDefinitionNode,
} from "graphql";
import { Kind, ValidationContext } from "graphql";

import type { TypeAndOperationPathInfo } from "./operationPaths";
import type { RuleError } from "./ruleError";

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
  getTypeInfo() {
    return this.typeInfo;
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
  operationPathByNode = new Map<ASTNode, string>();
  operationNamesByNode = new Map<ASTNode, Array<string | undefined>>();

  _fragmentsByRoot = new Map<
    FragmentDefinitionNode | OperationDefinitionNode,
    FragmentSpreadNode[]
  >();
  _nodesByRoot = new Map<
    FragmentDefinitionNode | OperationDefinitionNode,
    Array<ASTNode>
  >();
  _operationDefinitions: OperationDefinitionNode[] = [];
  _fragmentDefinitions: FragmentDefinitionNode[] = [];
  initEnterNode(node: ASTNode) {
    const root = this.typeInfo.getCurrentRoot();
    if (root != null) {
      let list = this._nodesByRoot.get(root);
      if (!list) {
        list = [];
        this._nodesByRoot.set(root, list);
      }
      list.push(node);
    }
    if (node.kind === Kind.OPERATION_DEFINITION) {
      this._operationDefinitions.push(node);
    }
    if (node.kind === Kind.FRAGMENT_DEFINITION) {
      this._fragmentDefinitions.push(node);
    }
    if (node.kind === Kind.FRAGMENT_SPREAD) {
      if (!this.typeInfo.currentRoot) {
        throw new Error(
          "Cannot have a fragment spread without being inside a fragment definition/operation",
        );
      }
      let list = this._fragmentsByRoot.get(this.typeInfo.currentRoot);
      if (!list) {
        list = [];
        this._fragmentsByRoot.set(this.typeInfo.currentRoot, list);
      }
      list.push(node);
    }
    this.operationPathByNode.set(node, this.typeInfo.getOperationPath());
  }
  initLeaveNode(node: ASTNode) {
    if (node.kind === Kind.DOCUMENT) {
      // Finalize
      for (const operationDefinition of this._operationDefinitions) {
        const operationName = operationDefinition.name?.value;
        const walk = (
          root: OperationDefinitionNode | FragmentDefinitionNode,
          visited: Set<OperationDefinitionNode | FragmentDefinitionNode>,
        ) => {
          // This runs before we've ensured there's no cycles, so we must protect ourself
          if (visited.has(root)) {
            return;
          }
          visited.add(root);
          // Every node in this root is within operationName
          const nodes = this._nodesByRoot.get(root);
          if (nodes) {
            for (const node of nodes) {
              let list = this.operationNamesByNode.get(node);
              if (!list) {
                list = [];
                this.operationNamesByNode.set(node, list);
              }
              list.push(operationName);
            }
          }
          const fragSpreads = this._fragmentsByRoot.get(root);
          if (fragSpreads) {
            for (const fragSpread of fragSpreads) {
              const frag = this._fragmentDefinitions.find(
                (d) => d.name.value === fragSpread.name.value,
              );
              if (frag) {
                walk(frag, visited);
              }
            }
          }
          visited.delete(root);
        };
        walk(operationDefinition, new Set());
      }
    }
  }
  getOperationNamesAndCoordinatesForNodes(
    nodes: readonly ASTNode[] | undefined,
  ): {
    operationNames: readonly (string | undefined)[];
    operationCoordinates: string[];
  } {
    if (nodes == null) {
      console.log(`No nodes!`);
      return {
        operationNames: [],
        operationCoordinates: [],
      };
    }
    const operationNames = new Set<string | undefined>();
    const operationCoordinates = new Set<string>();
    for (const node of nodes) {
      const nodeOperationNames = this.operationNamesByNode.get(node);
      if (nodeOperationNames) {
        for (const operationName of nodeOperationNames) {
          operationNames.add(operationName);
        }
      }
      const nodeOperationCoordinate = this.operationPathByNode.get(node);
      if (nodeOperationCoordinate) {
        operationCoordinates.add(nodeOperationCoordinate);
      }
    }
    return {
      operationNames: [...operationNames],
      operationCoordinates: [...operationCoordinates],
    };
  }
}

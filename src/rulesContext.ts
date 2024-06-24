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

import type { ErrorOperationLocation } from "./interfaces";
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
  // Operation path but only relative to the root (which could be a fragment)
  subPathByNode = new Map<ASTNode, string>();
  operationPathsByNodeByOperation = new Map<
    OperationDefinitionNode,
    Map<ASTNode, string[]>
  >();
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
    this.subPathByNode.set(node, this.typeInfo.getOperationPath());
  }
  initLeaveNode(node: ASTNode) {
    if (node.kind === Kind.DOCUMENT) {
      // Finalize
      for (const operationDefinition of this._operationDefinitions) {
        const operationName = operationDefinition.name?.value;
        const operationPathsByNode: Map<ASTNode, string[]> = new Map();
        this.operationPathsByNodeByOperation.set(
          operationDefinition,
          operationPathsByNode,
        );
        const walk = (
          root: OperationDefinitionNode | FragmentDefinitionNode,
          path: string,
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
              const subpath = this.subPathByNode.get(node);
              if (subpath != null) {
                const fullPath = path + subpath;
                let list = operationPathsByNode.get(node);
                if (!list) {
                  list = [];
                  operationPathsByNode.set(node, list);
                }
                list.push(fullPath);
              }
            }
          }
          const fragSpreads = this._fragmentsByRoot.get(root);
          if (fragSpreads) {
            for (const fragSpread of fragSpreads) {
              const frag = this._fragmentDefinitions.find(
                (d) => d.name.value === fragSpread.name.value,
              );
              if (frag) {
                const subpath = this.subPathByNode.get(fragSpread);
                const fullPath = path + subpath + ">";
                walk(frag, fullPath, visited);
              }
            }
          }
          visited.delete(root);
        };
        walk(operationDefinition, "", new Set());
      }
    }
  }
  getErrorOperationLocationsForNodes(
    nodes: readonly ASTNode[] | undefined,
  ): ReadonlyArray<ErrorOperationLocation> {
    if (nodes == null) {
      return [];
    }
    const map = new Map<string | undefined, Set<string>>();
    for (const node of nodes) {
      const nodeOperationNames = this.operationNamesByNode.get(node);
      if (nodeOperationNames) {
        for (const operationName of nodeOperationNames) {
          let set = map.get(operationName);
          if (!set) {
            set = new Set();
            map.set(operationName, set);
          }
          const op = this._operationDefinitions.find(
            (o) => o.name?.value === operationName,
          );
          if (op) {
            const operationPathsByNode =
              this.operationPathsByNodeByOperation.get(op);
            if (operationPathsByNode) {
              const nodeOperationCoordinates = operationPathsByNode.get(node);
              if (nodeOperationCoordinates) {
                for (const c of nodeOperationCoordinates) {
                  set.add(c);
                }
              }
            }
          }
        }
      }
    }
    const operations: Array<{
      operationName: string | undefined;
      operationCoordinates: string[];
    }> = [];
    for (const [operationName, operationCoordinates] of map) {
      operations.push({
        operationName,
        operationCoordinates: [...operationCoordinates],
      });
    }
    return operations;
  }
}

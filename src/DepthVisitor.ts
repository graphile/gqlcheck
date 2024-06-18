import {
  ASTVisitor,
  FragmentDefinitionNode,
  GraphQLList,
  GraphQLNonNull,
  GraphQLOutputType,
  isCompositeType,
  isNamedType,
  Kind,
  OperationDefinitionNode,
} from "graphql";
import { RulesContext } from "./rulesContext";

interface DepthInfo {
  current: number;
  max: number;
  coordsByDepth: Map<number, string[]>;
}

function newDepthInfo(): DepthInfo {
  return {
    current: 0,
    max: 0,
    coordsByDepth: new Map(),
  };
}

interface Root {
  type: "operation" | "fragment";
  name: string | undefined;
  depths: {
    fields: DepthInfo;
    lists: DepthInfo;
    introspectionFields: DepthInfo;
    introspectionLists: DepthInfo;
  };
  fragmentReferences: {
    [operationPath: string]: {
      [fragmentName: string]: {
        depthValues: {
          [key in keyof Root["depths"]]: number;
        };
      };
    };
  };
}

/** Used when the fragment references have been resolved */
interface ResolvedOperation {
  name: string | undefined;
  depths: {
    fields: DepthInfo;
    lists: DepthInfo;
    introspectionFields: DepthInfo;
    introspectionLists: DepthInfo;
  };
}

function newRoot(node: OperationDefinitionNode | FragmentDefinitionNode): Root {
  return {
    type: node.kind === Kind.OPERATION_DEFINITION ? "operation" : "fragment",
    name: node.name?.value,
    depths: {
      fields: newDepthInfo(),
      lists: newDepthInfo(),
      introspectionFields: newDepthInfo(),
      introspectionLists: newDepthInfo(),
    },
    fragmentReferences: Object.create(null),
  };
}

interface State {
  roots: Root[];
  complete: boolean;
}

function newState(): State {
  return {
    roots: [],
    complete: false,
  };
}

let state: State = newState();
state.complete = true;

export function DepthVisitor(context: RulesContext): ASTVisitor {
  let currentRoot: Root | null = null;
  function incDepth<TKey extends keyof Root["depths"]>(key: TKey) {
    if (!currentRoot) {
      throw new Error(
        `DepthVisitor attempted to increment depth, but there's no currentRoot!`,
      );
    }
    currentRoot.depths[key].current++;
    const { current, max } = currentRoot.depths[key];
    if (current > max) {
      currentRoot.depths[key].max = current;
      currentRoot.depths[key].coordsByDepth.set(current, [
        context.getOperationPath(),
      ]);
    } else if (current === max) {
      currentRoot.depths[key].coordsByDepth
        .get(current)!
        .push(context.getOperationPath());
    }
  }
  function decDepth<TKey extends keyof Root["depths"]>(key: TKey) {
    if (!currentRoot) {
      throw new Error(
        `DepthVisitor attempted to increment depth, but there's no currentRoot!`,
      );
    }
    currentRoot.depths[key].current--;
  }
  return {
    Document: {
      enter(node) {
        if (!state.complete) {
          console.warn("Previous DepthVisitor didn't complete cleanly");
        }
        state = newState();
      },
      leave(node) {
        // Finalize depths by applying all the fragment depths to the operations

        // Report the errors
        console.dir(state, { depth: 4 });

        // Clean up
        state.complete = true;
      },
    },
    OperationDefinition: {
      enter(node) {
        if (currentRoot) {
          throw new Error(
            `There should be no root when we visit an OperationDefinition`,
          );
        }
        currentRoot = newRoot(node);
        state.roots.push(currentRoot);
      },
      leave(node) {
        currentRoot = null;
      },
    },
    FragmentDefinition: {
      enter(node) {
        if (currentRoot) {
          throw new Error(
            `There should be no root when we visit a FragmentDefinition`,
          );
        }
        currentRoot = newRoot(node);
        state.roots.push(currentRoot);
      },
      leave(node) {
        currentRoot = null;
      },
    },
    FragmentSpread: {
      enter(node) {
        if (!currentRoot) {
          throw new Error(
            `There should be a root when we visit a FragmentSpread`,
          );
        }
        const operationPath = context.getOperationPath();
        const fragmentName = node.name.value;
        const depthValues: { [Key in keyof Root["depths"]]: number } = {
          fields: currentRoot.depths.fields.current,
          lists: currentRoot.depths.lists.current,
          introspectionFields: currentRoot.depths.introspectionFields.current,
          introspectionLists: currentRoot.depths.introspectionLists.current,
        };
        // Need to flag that all the depths should be extended by this
        if (!currentRoot.fragmentReferences[operationPath]) {
          currentRoot.fragmentReferences[operationPath] = {
            [fragmentName]: {
              depthValues,
            },
          };
        } else if (
          !currentRoot.fragmentReferences[operationPath][fragmentName]
        ) {
          currentRoot.fragmentReferences[operationPath][fragmentName] = {
            depthValues,
          };
        } else {
          // Visiting same fragment again; ignore
        }
      },
      leave(node) {
        // No specific action required
      },
    },
    Field: {
      enter(node) {
        const type = context.getType();
        if (!type) return;
        const { namedType, listDepth } = processType(type);
        if (isCompositeType(namedType)) {
          incDepth("fields");
          for (let i = 0; i < listDepth; i++) {
            incDepth("lists");
          }
        }
      },
      leave(node) {
        const type = context.getType();
        if (!type) return;
        const { namedType, listDepth } = processType(type);
        if (isCompositeType(namedType)) {
          decDepth("fields");
          for (let i = 0; i < listDepth; i++) {
            decDepth("lists");
          }
        }
      },
    },
  };
}

function processType(inputType: GraphQLOutputType) {
  let type = inputType;
  let listDepth = 0;
  while (!isNamedType(type)) {
    if (type instanceof GraphQLNonNull) {
      type = type.ofType as GraphQLOutputType;
    } else if (type instanceof GraphQLList) {
      type = type.ofType as GraphQLOutputType;
      listDepth++;
    } else {
      throw new Error(`Unexpected type ${type}`);
    }
  }
  return { namedType: type, listDepth };
}

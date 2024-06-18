import * as assert from "node:assert";
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

interface Depths {
  fields: DepthInfo;
  lists: DepthInfo;
  introspectionFields: DepthInfo;
  introspectionLists: DepthInfo;
}

interface IRoot {
  type: "operation" | "fragment";
  name: string | undefined;
  depths: Depths;
  fragmentReferences: {
    [operationPath: string]: {
      [fragmentName: string]: {
        depthValues: DepthValues;
      };
    };
  };
}
type DepthValues = {
  [key in keyof Depths]: number;
};
interface OperationRoot extends IRoot {
  type: "operation";
}
interface FragmentRoot extends IRoot {
  type: "fragment";
  name: string;
}
type Root = OperationRoot | FragmentRoot;

/** Used when the fragment references have been resolved */
interface ResolvedOperation {
  name: string | undefined;
  depths: Depths;
}

function newDepths(): Depths {
  return {
    fields: newDepthInfo(),
    lists: newDepthInfo(),
    introspectionFields: newDepthInfo(),
    introspectionLists: newDepthInfo(),
  };
}

function newRoot(node: OperationDefinitionNode | FragmentDefinitionNode): Root {
  if (node.kind === Kind.OPERATION_DEFINITION) {
    return {
      type: "operation",
      name: node.name?.value,
      depths: newDepths(),
      fragmentReferences: Object.create(null),
    };
  } else {
    return {
      type: "fragment",
      name: node.name.value,
      depths: newDepths(),
      fragmentReferences: Object.create(null),
    };
  }
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

function resolveFragment(
  fragmentRootByName: Record<string, FragmentRoot>,
  depths: Depths,
  operationPath: string,
  fragmentName: string,
  visitedFragments: string[],
) {
  const fragmentRoot = fragmentRootByName[fragmentName];
  if (!fragmentRoot) return;
  if (visitedFragments.includes(fragmentName)) {
    return;
  }

  visitedFragments.push(fragmentName);
  try {
    // Step 1: add all the fragments own depths
    for (const key of Object.keys(fragmentRoot.depths) as (keyof Depths)[]) {
      const { max: fragMax, coordsByDepth: fragCoordsByDepth } =
        fragmentRoot.depths[key];
      const adjustedMax = depths[key].current + fragMax;
      if (adjustedMax > depths[key].max) {
        depths[key].max = adjustedMax;
      }
      for (const [fragDepth, fragCoords] of fragCoordsByDepth) {
        const transformedCoords = fragCoords.map(
          (c) => `${operationPath}>${c}`,
        );
        const depth = depths[key].current + fragDepth;
        const list = depths[key].coordsByDepth.get(depth);
        if (list) {
          // More performant than list.push(...transformedCoords)
          transformedCoords.forEach((c) => list.push(c));
        } else {
          depths[key].coordsByDepth.set(depth, transformedCoords);
        }
      }
    }

    // Step 2: traverse to the next fragment
    traverseFragmentReferences(
      fragmentRootByName,
      depths,
      fragmentRoot.fragmentReferences,
      visitedFragments,
    );
  } finally {
    const popped = visitedFragments.pop();
    assert.equal(
      popped,
      fragmentName,
      "Something went wrong when popping fragment name?",
    );
  }
}
function traverseFragmentReferences(
  fragmentRootByName: Record<string, FragmentRoot>,
  depths: Depths,
  fragmentReferences: IRoot["fragmentReferences"],
  visitedFragments: string[],
): void {
  for (const [operationPath, depthsByFragmentReference] of Object.entries(
    fragmentReferences,
  )) {
    for (const [fragmentName, spec] of Object.entries(
      depthsByFragmentReference,
    )) {
      for (const key of Object.keys(depths) as (keyof Depths)[]) {
        depths[key].current += spec.depthValues[key];
      }
      resolveFragment(
        fragmentRootByName,
        depths,
        operationPath,
        fragmentName,
        visitedFragments,
      );
      for (const key of Object.keys(depths) as (keyof Depths)[]) {
        depths[key].current -= spec.depthValues[key];
      }
    }
  }
}

function resolveOperationRoot(
  fragmentRootByName: Record<string, FragmentRoot>,
  operationRoot: OperationRoot,
): ResolvedOperation {
  const depths = newDepths();
  for (const key of Object.keys(depths) as ReadonlyArray<keyof Depths>) {
    depths[key].max = operationRoot.depths[key].max;
    depths[key].coordsByDepth = new Map(
      operationRoot.depths[key].coordsByDepth,
    );
  }
  traverseFragmentReferences(
    fragmentRootByName,
    depths,
    operationRoot.fragmentReferences,
    [],
  );
  return {
    name: operationRoot.name,
    depths,
  };
}

function resolveRoots(state: State): readonly ResolvedOperation[] {
  const operationRoots: OperationRoot[] = [];
  const fragmentRootByName: {
    [fragmentName: string]: FragmentRoot;
  } = Object.create(null);

  for (const root of state.roots) {
    if (root.type === "operation") {
      operationRoots.push(root);
    } else {
      fragmentRootByName[root.name] = root;
    }
  }

  return operationRoots.map((root) =>
    resolveOperationRoot(fragmentRootByName, root),
  );
}

export function DepthVisitor(context: RulesContext): ASTVisitor {
  let state: State = newState();
  state.complete = true;
  let currentRoot: Root | null = null;
  function incDepth<TKey extends keyof Depths>(key: TKey) {
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
  function decDepth<TKey extends keyof Depths>(key: TKey) {
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
        const resolvedOperation = resolveRoots(state);

        // Report the errors
        console.dir(resolvedOperation, { depth: 4 });

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
        const depthValues: { [Key in keyof Depths]: number } = {
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

import * as assert from "node:assert";

import type {
  ASTNode,
  ASTVisitor,
  FragmentDefinitionNode,
  GraphQLOutputType,
  OperationDefinitionNode,
} from "graphql";
import {
  GraphQLList,
  GraphQLNonNull,
  isCompositeType,
  isNamedType,
  Kind,
} from "graphql";

import { RuleError } from "./ruleError.js";
import type { RulesContext } from "./rulesContext.js";

interface DepthInfo {
  current: number;
  max: number;
  nodesByDepth: Map<number, ASTNode[]>;
}

function newDepthInfo(): DepthInfo {
  return {
    current: 0,
    max: 0,
    nodesByDepth: new Map(),
  };
}

type Depths = {
  fields: DepthInfo;
  lists: DepthInfo;
  introspectionFields: DepthInfo;
  introspectionLists: DepthInfo;
} & {
  [coordinate: string]: DepthInfo | undefined;
};

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
  [key in keyof Depths]: number | undefined;
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
      const { max: fragMax, nodesByDepth: fragNodesByDepth } =
        fragmentRoot.depths[key]!;
      if (!depths[key]) {
        depths[key] = newDepthInfo();
      }
      const adjustedMax = depths[key].current + fragMax;
      if (adjustedMax > depths[key].max) {
        depths[key].max = adjustedMax;
      }
      for (const [fragDepth, fragNodes] of fragNodesByDepth) {
        //const transformedCoords = fragNodes.map((c) => `${operationPath}${c}`);
        const depth = depths[key].current + fragDepth;
        const list = depths[key].nodesByDepth.get(depth);
        if (list) {
          // More performant than list.push(...transformedCoords)
          fragNodes.forEach((c) => list.push(c));
        } else {
          depths[key].nodesByDepth.set(depth, [...fragNodes]);
        }
      }
    }

    // Step 2: traverse to the next fragment
    traverseFragmentReferences(
      fragmentRootByName,
      depths,
      operationPath,
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
  basePath: string,
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
        if (spec.depthValues[key]) {
          depths[key]!.current += spec.depthValues[key];
        }
      }
      resolveFragment(
        fragmentRootByName,
        depths,
        basePath + operationPath + ">",
        fragmentName,
        visitedFragments,
      );
      for (const key of Object.keys(depths) as (keyof Depths)[]) {
        if (spec.depthValues[key]) {
          depths[key]!.current -= spec.depthValues[key];
        }
      }
    }
  }
}

function resolveOperationRoot(
  fragmentRootByName: Record<string, FragmentRoot>,
  operationRoot: OperationRoot,
): ResolvedOperation {
  const depths = newDepths();
  for (const key of Object.keys(operationRoot.depths) as ReadonlyArray<
    keyof Depths
  >) {
    if (!depths[key]) {
      depths[key] = newDepthInfo();
    }
    depths[key].max = operationRoot.depths[key]!.max;
    depths[key].nodesByDepth = new Map(operationRoot.depths[key]!.nodesByDepth);
  }
  traverseFragmentReferences(
    fragmentRootByName,
    depths,
    "",
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
  function incDepth<TKey extends keyof Depths>(key: TKey, node: ASTNode) {
    if (!currentRoot) {
      throw new Error(
        `DepthVisitor attempted to increment depth, but there's no currentRoot!`,
      );
    }
    if (!currentRoot.depths[key]) {
      // assert(key.includes('.'));
      currentRoot.depths[key] = newDepthInfo();
    }
    currentRoot.depths[key].current++;
    const { current, max } = currentRoot.depths[key];
    if (current > max) {
      currentRoot.depths[key].max = current;
      currentRoot.depths[key].nodesByDepth.set(current, [node]);
    } else if (current === max) {
      currentRoot.depths[key].nodesByDepth.get(current)!.push(node);
    }
  }

  function decDepth<TKey extends keyof Depths>(key: TKey) {
    if (!currentRoot) {
      throw new Error(
        `DepthVisitor attempted to decrement depth, but there's no currentRoot!`,
      );
    }
    if (!currentRoot.depths[key]) {
      throw new Error(
        `DepthVisitor attempted to decrement depth, but the matching key doesn't exist!`,
      );
    }
    currentRoot.depths[key].current--;
  }

  return {
    Document: {
      enter(_node) {
        if (!state.complete) {
          console.warn("Previous DepthVisitor didn't complete cleanly");
        }
        state = newState();
      },
      leave(_node) {
        // Finalize depths by applying all the fragment depths to the operations
        const resolvedOperations = resolveRoots(state);
        const resolvedPreset = context.getResolvedPreset();

        // Report the errors
        for (const resolvedOperation of resolvedOperations) {
          const operationName = resolvedOperation.name;
          const config: GraphileConfig.GraphQLCheckConfig = {
            // Global configuration
            ...resolvedPreset.gqlcheck?.config,

            // Override for this operation
            ...(operationName
              ? resolvedPreset.gqlcheck?.operationOverrides?.[operationName]
              : null),
          };
          const {
            maxDepth = 12,
            maxListDepth = 4,
            maxSelfReferentialDepth = 2,
            maxIntrospectionDepth = 14,
            maxIntrospectionListDepth = 3,
            maxIntrospectionSelfReferentialDepth = 2,
          } = config;
          const maxDepthByFieldCoordinates: Record<string, number> = {
            // Defaults
            "Query.__schema": 1,
            "Query.__type": 1,
            "__Type.fields": 1,
            "__Type.inputFields": 1,
            "__Type.interfaces": 1,
            "__Type.ofType": 9,
            "__Type.possibleTypes": 1,
            "__Field.args": 1,
            "__Field.type": 1,

            // Global config
            ...resolvedPreset.gqlcheck?.config?.maxDepthByFieldCoordinates,

            // Override for this operation
            ...(operationName
              ? resolvedPreset.gqlcheck?.operationOverrides?.[operationName]
                  ?.maxDepthByFieldCoordinates
              : null),
          };

          // Now see if we've exceeded the limits
          for (const key of Object.keys(resolvedOperation.depths)) {
            const { max, nodesByDepth } = resolvedOperation.depths[key]!;
            const selfReferential = key.includes(".");
            const [limit, override, infraction, label] = ((): [
              limit: number,
              override: GraphileConfig.GraphQLCheckConfig,
              infraction: string,
              label: string,
            ] => {
              if (selfReferential) {
                // Schema coordinate
                const isIntrospection =
                  key.startsWith("__") || key.includes(".__");
                const limit =
                  maxDepthByFieldCoordinates[key] ??
                  (isIntrospection
                    ? maxIntrospectionSelfReferentialDepth
                    : maxSelfReferentialDepth);
                return [
                  limit,
                  { maxDepthByFieldCoordinates: { [key]: max } },
                  `maxDepthByFieldCoordinates['${key}']`,
                  `Self-reference limit for field '${key}'`,
                ];
              } else {
                switch (key) {
                  case "fields":
                    return [
                      maxDepth,
                      { maxDepth: max },
                      "maxDepth",
                      "Maximum selection depth limit",
                    ];
                  case "lists":
                    return [
                      maxListDepth,
                      { maxListDepth: max },
                      "maxListDepth",
                      "Maximum list nesting depth limit",
                    ];
                  case "introspectionFields":
                    return [
                      maxIntrospectionDepth,
                      { maxIntrospectionDepth: max },
                      "maxIntrospectionDepth",
                      "Maximum introspection selection depth limit",
                    ];
                  case "introspectionLists":
                    return [
                      maxIntrospectionListDepth,
                      { maxIntrospectionListDepth: max },
                      "maxIntrospectionListDepth",
                      "Maximum introspection list nesting depth limit",
                    ];
                  default: {
                    throw new Error(`Key '${key}' has no associated setting?`);
                  }
                }
              }
            })();
            if (max > limit) {
              const nodes: ASTNode[] = [];
              for (let i = limit + 1; i <= max; i++) {
                nodesByDepth.get(i)?.forEach((c) => nodes.push(c));
              }
              const error = new RuleError(
                `${label} exceeded: ${max} > ${limit}`,
                {
                  infraction,
                  nodes,
                  override,
                },
              );
              context.reportError(error);
            }
          }
          // console.dir(resolvedOperation, { depth: 4 });
        }

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
      leave(_node) {
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
      leave(_node) {
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
        const depthValues: DepthValues = {
          fields: 0,
          lists: 0,
          introspectionFields: 0,
          introspectionLists: 0,
        };
        for (const key of Object.keys(currentRoot.depths) as (keyof Depths)[]) {
          depthValues[key] = currentRoot.depths[key]!.current;
        }
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
      leave(_node) {
        // No specific action required
      },
    },
    Field: {
      enter(node) {
        const returnType = context.getType();
        if (!returnType) return;
        const parentType = context.getParentType();
        if (!parentType) return;
        const { namedType, listDepth } = processType(returnType);
        if (isCompositeType(namedType)) {
          incDepth(`${parentType.name}.${node.name.value}`, node);
          incDepth(
            context.isIntrospection() ? "introspectionFields" : "fields",
            node,
          );
          for (let i = 0; i < listDepth; i++) {
            incDepth(
              context.isIntrospection() ? "introspectionLists" : "lists",
              node,
            );
          }
        }
      },
      leave(node) {
        const returnType = context.getType();
        if (!returnType) return;
        const parentType = context.getParentType();
        if (!parentType) return;
        const { namedType, listDepth } = processType(returnType);
        if (isCompositeType(namedType)) {
          decDepth(`${parentType.name}.${node.name.value}`);
          decDepth(
            context.isIntrospection() ? "introspectionFields" : "fields",
          );
          for (let i = 0; i < listDepth; i++) {
            decDepth(
              context.isIntrospection() ? "introspectionLists" : "lists",
            );
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

import type { ASTVisitor } from "graphql";
import { Kind } from "graphql";

import type { CheckDocumentCounts } from "./interfaces.js";
import type { RulesContext } from "./rulesContext.js";

let counts: CheckDocumentCounts = {};

export function CountVisitor(context: RulesContext): ASTVisitor {
  return {
    enter(node) {
      if (node.kind === Kind.DOCUMENT) {
        counts = Object.create(null);
      }
      if (counts[node.kind] === undefined) {
        counts[node.kind] = 1;
      } else {
        counts[node.kind]!++;
      }
    },
    leave(node) {
      if (node.kind === Kind.DOCUMENT) {
        context.addMeta("count", counts);
      }
    },
  };
}

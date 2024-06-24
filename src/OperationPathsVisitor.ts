import { type ASTVisitor, Kind } from "graphql";

import type { RulesContext } from "./rulesContext";

export function OperationPathsVisitor(context: RulesContext): ASTVisitor {
  return {
    enter(node) {
      context.initEnterNode(node);
    },
    leave(node) {
      context.initLeaveNode(node);
    },
  };
}

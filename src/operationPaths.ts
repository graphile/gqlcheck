import * as assert from "node:assert";
import {
  ASTVisitor,
  Kind,
  TypeInfo,
  getEnterLeaveForKind,
  getNamedType,
  getNullableType,
  isNamedType,
} from "graphql";
import { ASTNode, isNode } from "graphql/language/ast";

/*
export function visitWithTypeInfoEnhanced(
  typeInfo: TypeInfo,
  visitor: ASTVisitor,
): ASTVisitor {
  const operationPathInfo = new OperationPathInfo();
  return {
    enter(...args) {
      const node = args[0];
      typeInfo.enter(node);
      operationPathInfo.enter(node, typeInfo);
      const fn = getEnterLeaveForKind(visitor, node.kind).enter;

      if (fn) {
        const result = fn.apply(visitor, args);

        if (result !== undefined) {
          operationPathInfo.leave(node, typeInfo);
          typeInfo.leave(node);

          if (isNode(result)) {
            typeInfo.enter(result);
            operationPathInfo.enter(result, typeInfo);
          }
        }

        return result;
      }
    },

    leave(...args) {
      const node = args[0];
      const fn = getEnterLeaveForKind(visitor, node.kind).leave;
      let result;

      if (fn) {
        result = fn.apply(visitor, args);
      }

      operationPathInfo.leave(node, typeInfo);
      typeInfo.leave(node);
      return result;
    },
  };
}
*/

export class TypeAndOperationPathInfo extends TypeInfo {
  operationPathParts: string[] = [];
  enter(node: ASTNode) {
    this.enterOperationPath(node);
    const result = super.enter(node);
    return result;
  }
  leave(node: ASTNode) {
    const result = super.leave(node);
    this.leaveOperationPath(node);
    return result;
  }
  enterOperationPath(node: ASTNode) {
    switch (node.kind) {
      case Kind.SELECTION_SET: {
        // Noop
        break;
      }
      case Kind.FIELD: {
        const fieldName = node.name.value;
        const alias = node.alias?.value;
        const namedType = getNamedType(this.getType());
        const typeName = namedType ? namedType.name : "???";
        this.operationPathParts.push(
          `>${alias ? `${alias}:` : ""}${typeName}.${fieldName}`,
        );
        break;
      }
      case Kind.DIRECTIVE: {
        this.operationPathParts.push(`@${node.name.value}`);
        break;
      }
      case Kind.OPERATION_DEFINITION: {
        const opKind = node.operation;
        const opName = node.name?.value;
        assert.equal(
          this.operationPathParts.length,
          0,
          "Path should be empty when entering an operation",
        );
        if (opName) {
          this.operationPathParts.push(`${opName}:${opKind}`);
        } else {
          this.operationPathParts.push(opKind);
        }
        break;
      }
      case Kind.INLINE_FRAGMENT: {
        if (node.typeCondition) {
          this.operationPathParts.push(`${node.typeCondition.name.value}.`);
        } else {
          // TODO: what to use for anonymous inline spread without type
          // condition? May be useful for directives on fragments.
        }
        break;
      }
      case Kind.FRAGMENT_DEFINITION: {
        this.operationPathParts.push(
          `${node.name.value}:${node.typeCondition.name.value}.`,
        );
        break;
      }
      case Kind.VARIABLE_DEFINITION: {
        this.operationPathParts.push(`($${node.variable.name.value}:)`);
        break;
      }
      case Kind.ARGUMENT: {
        this.operationPathParts.push(`(${node.name.value}:)`);
        break;
      }
      case Kind.LIST: {
        const listType: unknown = getNullableType(this.getInputType());
        break;
      }
      case Kind.OBJECT_FIELD: {
        const objectType: unknown = getNamedType(this.getInputType());
        break;
      }
      case Kind.ENUM: {
        const enumType: unknown = getNamedType(this.getInputType());
        break;
      }
    }
    // console.log(node.kind + ": " + this.operationPathParts.join(""));
  }
  leaveOperationPath(node: ASTNode) {
    switch (node.kind) {
      case Kind.SELECTION_SET: {
        // Noop
        break;
      }
      case Kind.FIELD:
      case Kind.DIRECTIVE:
      case Kind.OPERATION_DEFINITION: {
        this.operationPathParts.pop();
        break;
      }
      case Kind.INLINE_FRAGMENT: {
        if (node.typeCondition) {
          this.operationPathParts.pop();
        } else {
          // TODO: what to use for anonymous inline spread without type
          // condition? May be useful for directives on fragments.
        }
        break;
      }
      case Kind.FRAGMENT_DEFINITION:
      case Kind.VARIABLE_DEFINITION:
      case Kind.ARGUMENT: {
        this.operationPathParts.pop();
        break;
      }
      case Kind.LIST: {
        const listType: unknown = getNullableType(this.getInputType());
        break;
      }
      case Kind.OBJECT_FIELD: {
        const objectType: unknown = getNamedType(this.getInputType());
        break;
      }
      case Kind.ENUM: {
        const enumType: unknown = getNamedType(this.getInputType());
        break;
      }
    }
  }

  getOperationPath() {
    return this.operationPathParts.join("");
  }
}

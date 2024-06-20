import * as assert from "node:assert";

import type { ASTNode } from "graphql";
import { getNamedType, getNullableType, Kind, TypeInfo } from "graphql";

export class TypeAndOperationPathInfo extends TypeInfo {
  operationPathParts: string[] = [];
  _introspectionDepth = 0;

  enter(node: ASTNode) {
    this.enterOperationPath(node);
    if (
      node.kind === Kind.FRAGMENT_DEFINITION &&
      node.typeCondition.name.value.startsWith("__")
    ) {
      this._introspectionDepth++;
    } else if (node.kind === Kind.FIELD && node.name.value.startsWith("__")) {
      this._introspectionDepth++;
    }
    const result = super.enter(node);
    return result;
  }

  leave(node: ASTNode) {
    const result = super.leave(node);
    if (
      node.kind === Kind.FRAGMENT_DEFINITION &&
      node.typeCondition.name.value.startsWith("__")
    ) {
      this._introspectionDepth--;
    } else if (node.kind === Kind.FIELD && node.name.value.startsWith("__")) {
      this._introspectionDepth--;
    }
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
        //const namedType = getNamedType(this.getType());
        //const typeName = namedType ? namedType.name : "???";
        const join = this.operationPathParts[
          this.operationPathParts.length - 1
        ].endsWith(".")
          ? ""
          : ">";
        this.operationPathParts.push(
          `${join}${alias ? `${alias}:` : ""}${fieldName}`,
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
        //const listType: unknown = getNullableType(this.getInputType());
        break;
      }
      case Kind.OBJECT_FIELD: {
        //const objectType: unknown = getNamedType(this.getInputType());
        break;
      }
      case Kind.ENUM: {
        //const enumType: unknown = getNamedType(this.getInputType());
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
        //const listType: unknown = getNullableType(this.getInputType());
        break;
      }
      case Kind.OBJECT_FIELD: {
        //const objectType: unknown = getNamedType(this.getInputType());
        break;
      }
      case Kind.ENUM: {
        //const enumType: unknown = getNamedType(this.getInputType());
        break;
      }
    }
  }

  getOperationPath() {
    return this.operationPathParts.join("");
  }

  isIntrospection() {
    return this._introspectionDepth > 0;
  }
}

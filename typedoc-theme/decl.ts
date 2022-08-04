import {
  DeclarationReflection,
  ParameterReflection,
  ReflectionKind,
  ReflectionType,
  SomeType,
} from "typedoc";
import { renderComment } from "./blocks";

function formatParamsOfFunc(params: ParameterReflection[] | undefined) {
  if (!params) return "";
  return params.map((param) => `${param.name}: ${formatType(param.type)}`).join(", ");
}

function formatType(type: SomeType | undefined): string {
  if (!type) return "unknown";
  if (type instanceof ReflectionType) {
    if (type.declaration.signatures && type.declaration.signatures.length === 1) {
      let str = "(";
      if (type.declaration.signatures[0].parameters) {
        str += formatParamsOfFunc(type.declaration.signatures[0].parameters);
      }
      str += ") => " + formatType(type.declaration.signatures[0].type);
      return str;
    } else {
      return type.toString();
    }
  }
  return type.toString();
}

function renderSignature(kind: string, body: string): string {
  return [`<Signature type="${kind}">`, "```typescript", body, "```", "</Signature>"].join("\n");
}

export function renderMethodOrFunction(decl: DeclarationReflection): string {
  const kind = decl.kind === ReflectionKind.Method ? "method" : "function";
  return (decl.signatures ?? [])
    .flatMap((sig) => [
      renderSignature(kind, `${sig.name}(${formatParamsOfFunc(sig.parameters)}): ${formatType(sig.type)}`),
      renderComment(sig.comment),
      "",
    ])
    .join("\n");
}

export function renderProperty(decl: DeclarationReflection): string {
  return [
    renderSignature("property", `${decl.name}: ${formatType(decl.type)}`),
    renderComment(decl.comment),
    "",
  ].join("\n");
}

export function renderClassSummary(decl: DeclarationReflection): string {
  return [renderSignature("class", `class ${decl.name}`), renderComment(decl.comment), ""].join("\n");
}

export function renderConstructor(decl: DeclarationReflection): string {
  return (decl.signatures ?? [])
    .flatMap((sig) => [
      renderSignature("constructor", `constructor(${formatParamsOfFunc(sig.parameters)})`),
      renderComment(sig.comment),
      "",
    ])
    .join("\n");
}

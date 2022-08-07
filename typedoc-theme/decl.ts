import {
  DeclarationReflection,
  PageEvent,
  ParameterReflection,
  ReflectionType,
  SomeType,
  TypeParameterReflection,
} from "typedoc";
import { renderComment } from "./blocks";
import { renderExport } from "./render-export";

function formatTypeParams(params: TypeParameterReflection[] | undefined) {
  if (!params) return "";
  return "<" + params.map((p) => p.name).join(", ") + ">";
}

function formatParamsOfFunc(params: ParameterReflection[] | undefined) {
  if (!params) return "";
  return params
    .map((param) => `${param.flags.isRest ? "..." : ""}${param.name}: ${formatType(param.type)}`)
    .join(", ");
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

export function renderFunction(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  return (decl.signatures ?? [])
    .flatMap((sig) => [
      renderExport(
        decl,
        `function ${sig.name}${formatTypeParams(sig.typeParameters)}(${formatParamsOfFunc(
          sig.parameters
        )}): ${formatType(sig.type)};`
      ),
      renderComment(page, sig.comment),
      "",
    ])
    .join("\n");
}

// use italic unicode characters to allow italic inside the code block
const italicObj = "𝑜𝑏𝑗";

export function renderMethod(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  const staticClassName = decl.flags.isStatic ? decl.parent?.name : undefined;
  return (decl.signatures ?? [])
    .flatMap((sig) => [
      renderExport(
        decl,
        `${staticClassName ?? italicObj}.${sig.name}${formatTypeParams(
          sig.typeParameters
        )}(${formatParamsOfFunc(sig.parameters)}): ${formatType(sig.type)};`
      ),
      renderComment(page, sig.comment),
      "",
    ])
    .join("\n");
}

export function renderProperty(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  return [
    renderExport(decl, `${italicObj}.${decl.name}: ${formatType(decl.type)};`),
    renderComment(page, decl.comment),
    "",
  ].join("\n");
}

export function renderClassSummary(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  return [renderExport(decl, `class ${decl.name};`), renderComment(page, decl.comment), ""].join("\n");
}

export function renderConstructor(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  return (decl.signatures ?? [])
    .flatMap((sig) => [
      renderExport(decl, `${decl.parent?.name ?? ""} constructor(${formatParamsOfFunc(sig.parameters)})`),
      renderComment(page, sig.comment),
      "",
    ])
    .join("\n");
}

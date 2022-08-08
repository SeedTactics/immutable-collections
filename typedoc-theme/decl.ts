import { DeclarationReflection, PageEvent, SignatureReflection } from "typedoc";
import * as ts from "typescript";
import { renderComment } from "./blocks";
import { renderExport } from "./render-export";

export interface SigRefAndOriginalSource extends SignatureReflection {
  seedtactics_originalSource?: {
    typeParams?: string[];
    params: string[];
    type?: string;
  };
}

export function onCreateSignature(
  _ctx: unknown,
  sigRef: SigRefAndOriginalSource,
  decl: ts.SignatureDeclaration | ts.IndexSignatureDeclaration | ts.JSDocSignature
) {
  sigRef.seedtactics_originalSource = {
    typeParams: decl.typeParameters?.map((p) => p.getFullText()),
    params: decl.parameters.map((p) => p.getFullText()),
    type: decl.type?.getFullText(),
  };
}

function formatSignature(sig: SigRefAndOriginalSource, includeName = true): string {
  const parts: string[] = [];
  if (includeName) {
    parts.push(sig.name);
  }
  const source = sig.seedtactics_originalSource;
  if (!source) {
    throw new Error("Unable to find original source for " + sig.name);
  }

  if (source.typeParams) {
    parts.push("<");
    for (const p of source.typeParams) parts.push(p);
    parts.push(">");
  }

  parts.push("(");
  let hasNewline = false;
  for (const p of source.params) {
    if (p.indexOf("\n") >= 0) hasNewline = true;
    parts.push(p);
  }
  // if some param has a newline, add a final newline before the close paren
  if (hasNewline) parts.push("\n");
  parts.push("):");

  if (!source.type) {
    throw new Error("No return type for " + sig.name);
  }

  parts.push(source.type);

  return parts.join("");
}

export function renderFunction(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  return (decl.signatures ?? [])
    .flatMap((sig) => [
      renderExport(decl, `function ${formatSignature(sig)};`),
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
    .flatMap((sig: SigRefAndOriginalSource) => [
      renderExport(decl, `${staticClassName ?? italicObj}.${formatSignature(sig)};`),
      renderComment(page, sig.comment),
      "",
    ])
    .join("\n");
}

export function renderProperty(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  return [
    renderExport(decl, `${italicObj}.${decl.name}: ${decl.type?.toString() ?? ""};`),
    renderComment(page, decl.comment),
    "",
  ].join("\n");
}

export function renderClassSummary(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  return [
    renderExport(decl, `class ${decl.name};`),
    renderComment(page, decl.comment),
    "",
    `[See ${decl.name} Class Details](./${decl.getAlias()})`,
    "",
    "",
  ].join("\n");
}

export function renderConstructor(page: PageEvent<unknown>, decl: DeclarationReflection): string {
  return (decl.signatures ?? [])
    .flatMap((sig) => [
      renderExport(decl, `${decl.parent?.name ?? ""} constructor${formatSignature(sig, false)};`),
      renderComment(page, sig.comment),
      "",
    ])
    .join("\n");
}

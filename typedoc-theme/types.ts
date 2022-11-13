import { DeclarationReflection, PageEvent } from "typedoc";
import * as ts from "typescript";
import { renderComment } from "./blocks";
import { renderExport } from "./render-export";

export function renderTypeAlias(page: PageEvent<unknown>, decl: DeclarationReflection) {
  const s = decl.project.getSymbolFromReflection(decl);
  if (!s) {
    throw new Error("Unable to find symbol for " + decl.name);
  }
  const d = s.declarations?.[0];
  if (!d) {
    throw new Error("Unable to find declaration for " + decl.name);
  }
  let txt = "";
  const children = d.getChildren();
  for (let i = 1; i < children.length; i++) {
    if (children[i].kind === ts.SyntaxKind.SyntaxList) continue;
    txt += children[i].getFullText();
    if (i == 1) {
      txt = txt.trimStart();
    }
  }

  return [renderExport(decl, txt), renderComment(page, decl.comment), ""].join("\n");
}

export function renderInterface(decl: DeclarationReflection) {
  return " interface " + decl.getAlias() + "\n";
}

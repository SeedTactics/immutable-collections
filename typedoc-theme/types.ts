import { DeclarationReflection } from "typedoc";

export function renderTypeAlias(decl: DeclarationReflection) {
  return "type alias " + decl.getAlias() + "\n";
}

export function renderInterface(decl: DeclarationReflection) {
  return " interface " + decl.getAlias() + "\n";
}

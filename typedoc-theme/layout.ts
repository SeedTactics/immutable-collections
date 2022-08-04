import { DeclarationReflection, PageEvent } from "typedoc";

export function pageTemplate(page: PageEvent<DeclarationReflection>): string {
  let str = "";

  for (const child of page.model.children ?? []) {
    str += `0x${child.kind.toString(16)}: ${child.getAlias()}\n`;
  }

  return str;
}

export function classTemplate(page: PageEvent<DeclarationReflection>): string {
  let str = "Class " + page.model.getFullName();

  for (const child of page.model.children ?? []) {
    str += `0x${child.kind.toString(16)}: ${child.getAlias()}\n`;
  }

  return str;
}

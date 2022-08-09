import { DeclarationReflection } from "typedoc";

export function renderExport(decl: DeclarationReflection, body: string): string {
  const src = decl.sources?.[0].url;
  return [
    `<Export ${decl.anchor ? `anchor="${decl.anchor}"` : ""} ${src ? `src="${src}"` : ""}>`,
    "",
    "```typescript",
    body,
    "```",
    "",
    "</Export>",
  ].join("\n");
}

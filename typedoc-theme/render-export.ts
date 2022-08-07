import { DeclarationReflection } from "typedoc";

export function renderExport(decl: DeclarationReflection, body: string): string {
  const src = decl.sources?.[0].url;
  return [
    `<Export kind="${decl.kindString ?? "unknown"}" ${decl.anchor ? `anchor="${decl.anchor}"` : ""} ${
      src ? `src="${src}"` : ""
    } ${decl.flags.isStatic ? "static" : ""}>`,
    "```typescript",
    body,
    "```",
    "</Export>",
  ].join("\n");
}

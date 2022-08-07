import { DeclarationReflection, ReflectionKind } from "typedoc";

export function renderExport(decl: DeclarationReflection, body: string): string {
  let kind: string;
  switch (decl.kind) {
    case ReflectionKind.Method:
      kind = "method";
      break;
    case ReflectionKind.Function:
      kind = "function";
      break;
    case ReflectionKind.Property:
    case ReflectionKind.Accessor:
      kind = "property";
      break;
    case ReflectionKind.Class:
      kind = "class";
      break;
    case ReflectionKind.Constructor:
      kind = "constructor";
      break;
    default:
      throw new Error("Invalid declaration kind 0x" + decl.kind.toString(16));
  }
  const src = decl.sources?.[0].url;
  return [
    `<Export kind="${kind}" ${src ? ` src="${src}"` : ""} ${decl.flags.isStatic ? " static" : ""}>`,
    "```typescript",
    body,
    "```",
    "</Export>",
  ].join("\n");
}

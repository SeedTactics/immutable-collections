import { Comment, DeclarationReflection, PageEvent, ReflectionFlag, ReflectionKind } from "typedoc";
import { renderBlocks } from "./blocks";
import { renderClassSummary, renderConstructor, renderMethod, renderFunction, renderProperty } from "./decl";
import { renderInterface, renderTypeAlias } from "./types";

function firstParagraphOfRemarks(comment: Comment | null | undefined): string | null {
  if (!comment) return null;
  const remarks = comment.blockTags.filter((t) => t.tag === "@remarks")?.[0]?.content?.[0]?.text;
  if (remarks) {
    const idx = remarks.indexOf("\n\n");
    if (idx >= 0) {
      return remarks.substring(0, idx).replaceAll("\n", " ").replaceAll('"', "");
    } else {
      return remarks.replaceAll("\n", " ").replaceAll('"', "");
    }
  }
  return null;
}

export function pageTemplate(page: PageEvent<DeclarationReflection>): string {
  const module = page.model;
  const pageU = page as PageEvent<unknown>;
  let str = "---\n";
  str += `id: ${module.getAlias()}\n`;
  if (module.comment && module.comment.summary.length >= 1) {
    str += `title: ${module.comment.summary[0].text}\n`;
  }
  const descr = firstParagraphOfRemarks(module.comment);
  if (descr) {
    str += `description: "${descr}"\n`;
  }
  str += "---\n\n";

  str += 'import Export from "@site/src/components/ApiExport";\n\n';

  if (module.comment && module.comment.summary.length >= 1) {
    str += `# ${module.comment.summary[0].text}\n\n`;
    str += renderBlocks(pageU, module.comment.blockTags);
  }

  for (const child of page.model.children ?? []) {
    if (child.flags.hasFlag(ReflectionFlag.Private)) continue;
    switch (child.kind) {
      case ReflectionKind.Method:
        str += renderMethod(pageU, child);
        break;
      case ReflectionKind.Function:
        str += renderFunction(pageU, child);
        break;
      case ReflectionKind.Class:
        str += renderClassSummary(pageU, child);
        break;
      case ReflectionKind.Property:
      case ReflectionKind.Accessor:
        str += renderProperty(pageU, child);
        break;
      case ReflectionKind.Constructor:
        str += renderConstructor(pageU, child);
        break;

      case ReflectionKind.TypeAlias:
        str += renderTypeAlias(child);
        break;
      case ReflectionKind.Interface:
        str += renderInterface(child);
        break;

      default:
        throw new Error(
          "Documentation does not support kind 0x" + child.kind.toString(16) + " for " + child.getAlias()
        );
    }
  }

  return str;
}

import {
  Comment,
  DeclarationReflection,
  PageEvent,
  ReferenceReflection,
  ReflectionFlag,
  ReflectionKind,
} from "typedoc";
import { renderBlocks } from "./blocks";
import {
  renderClassSummary,
  renderConstructor,
  renderMethod,
  renderFunction,
  renderProperty,
} from "./decl";
import { renderInterface, renderTypeAlias } from "./types";

function firstParagraphOfRemarks(comment: Comment | null | undefined): string | null {
  if (!comment) return null;
  const remarks = comment.blockTags.filter((t) => t.tag === "@remarks")?.[0]?.content?.[0]
    ?.text;
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

function renderChild(pageU: PageEvent<unknown>, child: DeclarationReflection): string {
  switch (child.kind) {
    case ReflectionKind.Method:
      return renderMethod(pageU, child);
    case ReflectionKind.Function:
      return renderFunction(pageU, child);
    case ReflectionKind.Class:
      return renderClassSummary(pageU, child);
    case ReflectionKind.Property:
    case ReflectionKind.Accessor:
      return renderProperty(pageU, child);
    case ReflectionKind.Constructor:
      return renderConstructor(pageU, child);

    case ReflectionKind.TypeAlias:
      return renderTypeAlias(pageU, child);
    case ReflectionKind.Interface:
      return renderInterface(child);
    case ReflectionKind.Reference:
      if (child instanceof ReferenceReflection) {
        const target = child.getTargetReflectionDeep();
        if (target instanceof DeclarationReflection) {
          return renderChild(pageU, target);
        } else {
          throw new Error("Target is not a declaration reflection");
        }
      } else {
        throw new Error("Reference is not a ReferenceReflection");
      }

    default:
      throw new Error(
        "Documentation does not support kind 0x" +
          child.kind.toString(16) +
          " for " +
          child.getAlias()
      );
  }
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

  str += 'import Export from "@site/src/components/ApiExport";\n';
  str += 'import Summary from "@site/src/components/ApiSummary";\n\n';

  if (module.comment && module.comment.summary.length >= 1) {
    str += `# ${module.comment.summary[0].text}\n\n`;
    str += renderBlocks(pageU, module.comment.blockTags);
  }

  if (page.model.categories) {
    // sort categories by source file position
    const cats = [...page.model.categories]
      .sort((a, b) => {
        const aLine = a.children[0].sources?.[0].line ?? -1;
        const bLine = b.children[0].sources?.[0].line ?? -1;
        return aLine - bLine;
      })
      .filter(
        (c) =>
          c.children.findIndex((child) => !child.flags.hasFlag(ReflectionFlag.Private)) >=
          0
      );

    // When typedoc processes categories, it removes the category comment block from the
    // list of comments.  Thus if a declaration is processesd twice like with a reference,
    // the second time the category comment has been removed during the first time and thus
    // the reference is categorized as "Other".  Mutable data strikes again!
    const otherReferences =
      cats
        .find((c) => c.title === "Other")
        ?.children?.filter((d) => d instanceof ReferenceReflection)
        .map((d) => {
          // I couldn't see a way of getting the category comment back, so I'm just going to
          // hard code the categories...

          let category: string | undefined;
          if (d.name === "HashableObj" || d.name === "hashValues") {
            category = "Hashing";
          }
          return { category, d };
        }) ?? [];

    for (const group of cats) {
      str += `## ${group.title}\n\n`;
      for (const child of group.children.filter(
        (d) => otherReferences.findIndex((r) => r.d === d) < 0
      )) {
        if (child.flags.hasFlag(ReflectionFlag.Private)) continue;
        str += renderChild(pageU, child);
      }
      for (const otherRef of otherReferences) {
        if (otherRef.category === group.title) {
          str += renderChild(pageU, otherRef.d);
        }
      }
    }
  } else {
    for (const child of page.model.children ?? []) {
      if (child.flags.hasFlag(ReflectionFlag.Private)) continue;
      str += renderChild(pageU, child);
    }
  }

  return str;
}

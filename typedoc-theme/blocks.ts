import { Comment, CommentDisplayPart, CommentTag, PageEvent } from "typedoc";
import * as Path from "node:path";

const urlPrefix = /^https?:\/\//;

function displayPartsToMarkdown(page: PageEvent<unknown>, parts: ReadonlyArray<CommentDisplayPart>) {
  const result: string[] = [];

  for (const part of parts) {
    switch (part.kind) {
      case "text":
      case "code":
        result.push(part.text);
        break;
      case "inline-tag":
        switch (part.tag) {
          case "@link":
          case "@linkcode":
          case "@linkplain": {
            if (part.target) {
              let url: string | null = null;
              if (typeof part.target === "string") {
                url = part.target;
              } else if (part.target.url) {
                if (urlPrefix.test(part.target.url)) {
                  url = part.target.url;
                } else {
                  const relative = Path.relative(Path.dirname(page.filename), Path.dirname(part.target.url));
                  url = Path.join(relative, Path.basename(part.target.url)).replace(/\\/g, "/");
                }
              }
              const wrap = part.tag === "@linkcode" ? "`" : "";
              result.push(url ? `[${wrap}${part.text}${wrap}](${url})` : part.text);
            } else {
              result.push(part.text);
            }
            break;
          }
          default:
            break;
        }
        break;
    }
  }
  result.push("\n\n");

  return result.join("");
}

export function renderComment(page: PageEvent<unknown>, comment: Comment | undefined): string {
  if (!comment) return "";
  let str = displayPartsToMarkdown(page, comment.summary) + "\n";
  str += renderBlocks(page, comment.blockTags);
  return str;
}

export function renderBlocks(page: PageEvent<unknown>, blocks: ReadonlyArray<CommentTag>): string {
  let str = "";
  for (const block of blocks) {
    if ((block.tag === "@remarks" || block.tag === "@example") && block.content) {
      str += displayPartsToMarkdown(page, block.content);
    }
  }
  return str;
}

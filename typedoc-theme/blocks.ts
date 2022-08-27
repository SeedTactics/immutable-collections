import { Comment, CommentDisplayPart, CommentTag, PageEvent } from "typedoc";

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
                url = part.target.url;
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
  let str = `<Summary>\n\n${displayPartsToMarkdown(page, comment.summary)}</Summary>\n\n`;
  str += renderBlocks(page, comment.blockTags);
  return str;
}

export function renderBlocks(page: PageEvent<unknown>, blocks: ReadonlyArray<CommentTag>): string {
  let str = "";
  let hasExample = false;
  for (const block of blocks) {
    if (block.tag === "@remarks" && block.content) {
      str += displayPartsToMarkdown(page, block.content);
    }
    if (block.tag === "@example" && block.content) {
      hasExample = true;
    }
  }
  if (hasExample) {
    str += "<details>\n\n";
    for (const block of blocks) {
      if (block.tag === "@example" && block.content) {
        str += "<summary>Example</summary>\n\n";
        str += `<div>\n\n${displayPartsToMarkdown(page, block.content)}</div>\n\n`;
      }
    }
    str += "</details>\n\n";
  }
  return str;
}

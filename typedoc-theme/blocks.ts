import { Comment, CommentDisplayPart, CommentTag, PageEvent } from "typedoc";

function displayPartsToMarkdown(
  page: PageEvent<unknown>,
  parts: ReadonlyArray<CommentDisplayPart>,
  onlyFirstParagraph = false
) {
  const result: string[] = [];

  for (const part of parts) {
    switch (part.kind) {
      case "text":
      case "code":
        if (onlyFirstParagraph) {
          const paragraphBreak = part.text.indexOf("\n\n");
          if (paragraphBreak >= 0) {
            result.push(part.text.substring(0, paragraphBreak + 2));
            return result.join("");
          }
        }
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

export function renderComment(
  page: PageEvent<unknown>,
  comment: Comment | undefined,
  onlyFirstParagraph = false
): string {
  if (!comment) return "";
  let str = `<Summary>\n\n${displayPartsToMarkdown(page, comment.summary)}</Summary>\n\n`;
  str += "<Remarks>\n\n";
  str += renderBlocks(page, comment.blockTags, onlyFirstParagraph);
  str += "\n</Remarks>\n\n";
  return str;
}

export function renderBlocks(
  page: PageEvent<unknown>,
  blocks: ReadonlyArray<CommentTag>,
  onlyFirstParagraph = false
): string {
  let str = "";
  let hasExample = false;
  for (const block of blocks) {
    if (block.tag === "@remarks" && block.content) {
      str += displayPartsToMarkdown(page, block.content, onlyFirstParagraph);
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

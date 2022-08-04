import { Comment, CommentTag } from "typedoc";

export function renderComment(comment: Comment | undefined): string {
  if (!comment) return "";
  let str = "";
  for (const sum of comment.summary) {
    str += sum.text;
  }
  str += renderBlocks(comment.blockTags);
  return str;
}

export function renderBlocks(blocks: ReadonlyArray<CommentTag>): string {
  let str = "";
  for (const block of blocks) {
    if (block.tag === "@remarks" && block.content) {
      for (const chunk of block.content) {
        str += chunk.text + "\n";
      }
    }
  }
  return str;
}

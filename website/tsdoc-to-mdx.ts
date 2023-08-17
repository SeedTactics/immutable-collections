import { exit } from "node:process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as cp from "node:child_process";
import ts from "typescript";
import * as tsdoc from "@microsoft/tsdoc";

type DocFile = {
  readonly docId: string;
  readonly docTitle: string;
  readonly tsFile: string;
  readonly singleClass: string | null;
};

const allFiles: ReadonlyArray<DocFile> = [
  {
    docId: "class_api",
    docTitle: "A title",
    tsFile: "../src/api/classes.ts",
    singleClass: null,
  },
  {
    docId: "hashmap",
    docTitle: "A title",
    tsFile: "../src/api/hashmap.ts",
    singleClass: "HashMap",
  },
  {
    docId: "lazyseq",
    docTitle: "A title",
    tsFile: "../src/lazyseq.ts",
    singleClass: "LazySeq",
  },
];

const gitRev = cp
  .execSync("git rev-parse HEAD")
  .toString()
  .replace("\n", "")
  .replace("\r", "");
const srcPrefix = `https://github.com/SeedTactics/immutable-collections/blob/${gitRev}/`;

if (!fs.existsSync(path.join("docs", "api"))) {
  fs.mkdirSync(path.join("docs", "api"));
}
for (const d of allFiles) {
  emitDocFile(d);
}

function emitDocFile(doc: DocFile) {
  const outHandle = fs.openSync(
    path.join("docs", "api", path.basename(doc.tsFile, ".ts") + ".mdx"),
    "w"
  );
  function write(s: string): void {
    fs.writeFileSync(outHandle, s);
  }
  const program = ts.createProgram([doc.tsFile], { target: ts.ScriptTarget.ES2022 });
  const sourceFile = program.getSourceFile(doc.tsFile);
  const srcTxt = sourceFile.getFullText();
  const anchorCount = new Map<string, number>();
  let lastCategory: string | null = null;

  write("---\n");
  write(`id: ${doc.docId}\n`);
  write(`title: ${doc.docTitle}\n`);
  write("---\n\n");
  write(`import Export from "@site/src/components/ApiExport";\n`);
  write(`import Summary from "@site/src/components/ApiSummary";\n`);
  write(`import Remarks from "@site/src/components/ApiRemarks";\n\n`);

  write(`# ${doc.docTitle}\n\n`);

  if (doc.singleClass) {
    sourceFile.forEachChild((n) => {
      if (n.kind === ts.SyntaxKind.ClassDeclaration) {
        const d = n as ts.ClassDeclaration;
        if (d.name.getText(sourceFile) === doc.singleClass) {
          renderClassNode(d);
        }
      }
    });
  } else {
    sourceFile.forEachChild(renderNode);
  }
  fs.closeSync(outHandle);

  function simpleDocnodeToString(docNode: tsdoc.DocNode): string {
    if (docNode instanceof tsdoc.DocExcerpt) {
      return docNode.content.toString();
    } else {
      return docNode.getChildNodes().map(simpleDocnodeToString).join("");
    }
  }

  function renderDocNode(docNode: tsdoc.DocNode): void {
    if (docNode) {
      if (docNode instanceof tsdoc.DocLinkTag) {
        const code = docNode.codeDestination;
        const url = docNode.urlDestination;
        let linkTxt: string;
        let page: string | undefined = undefined;
        let hash: string;
        if (code) {
          linkTxt =
            docNode.linkText ??
            code.memberReferences.map((r) => r.memberIdentifier.identifier).join(".");
          if (code.importPath) {
            page = path.basename(code.importPath);
          }
          hash =
            code.memberReferences[code.memberReferences.length - 1].memberIdentifier
              .identifier;
        } else if (url) {
          linkTxt = docNode.linkText ?? url;
          page = url;
        } else {
          console.log("Invalid link");
          console.log(docNode);
          exit(1);
        }
        write(`[${linkTxt}](${page ?? ""}${hash ? "#" : ""}${hash})`);
      } else {
        // TODO: examples
        if (docNode instanceof tsdoc.DocExcerpt) {
          write(docNode.content.toString());
        }
        for (const childNode of docNode.getChildNodes()) {
          renderDocNode(childNode);
        }
      }
    }
  }

  function renderComment(comment: tsdoc.DocComment): void {
    write("<Summary>\n\n");
    renderDocNode(comment.summarySection);
    write("</Summary>\n\n");
    if (comment.remarksBlock) {
      write("<Remarks>\n");
      renderDocNode(comment.remarksBlock.content);
      write("\n</Remarks>\n");
    }
    write("\n");
  }

  function renderExport(sig: ts.SignatureDeclaration, namePrefix: string): void {
    let anchor = sig.name
      .getText(sourceFile)
      .replace("[", "")
      .replace("]", "")
      .replace(".", "_");
    if (anchorCount.has(anchor)) {
      anchorCount.set(anchor, anchorCount.get(anchor) + 1);
      anchor = anchor + anchorCount.get(anchor).toString();
    } else {
      anchorCount.set(anchor, 1);
    }

    const src = srcPrefix + path.relative("..", doc.tsFile);

    write(`<Export anchor="${anchor}" src="${src}">\n\n`);
    write("```typescript\n");

    if (namePrefix) {
      write(namePrefix);
      write(sig.name.getText(sourceFile));
    }
    if (sig.typeParameters) {
      write("<");
      write(sig.typeParameters.map((t) => t.getFullText(sourceFile)).join(","));
      write(">");
    }

    if (sig.parameters) {
      write("(");
      const params = sig.parameters.map((t) => t.getFullText(sourceFile)).join(",");
      write(params);
      // if some param has a newline, add a final newline before the close paren
      if (params.indexOf("\n") >= 0) write("\n");
      write(")");
    }
    write(":");
    write(sig.type.getFullText(sourceFile));
    write("\n```\n\n");
    write("</Export>\n\n");
  }

  function renderNode(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.ClassDeclaration: {
        console.log("TODO: class decl");
        break;
      }

      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.PropertyDeclaration: {
        const decl = node as ts.SignatureDeclaration;
        const modFlags = ts.getCombinedModifierFlags(decl);
        const comment = parseComment(node);
        if (comment && !(modFlags & ts.ModifierFlags.Private)) {
          const prefix =
            node.kind === ts.SyntaxKind.FunctionDeclaration
              ? "function "
              : node.kind === ts.SyntaxKind.ConstructSignature
              ? "constructor "
              : modFlags & ts.ModifierFlags.Static
              ? "static "
              : "𝑜𝑏𝑗.";
          const categoryDoc = comment.customBlocks.find(
            (b) => b.blockTag.tagName === "@category"
          )?.content;
          if (!categoryDoc) {
            console.log("Missing category in " + decl.name.getText(sourceFile));
            exit(1);
          }
          const category = simpleDocnodeToString(categoryDoc);
          if (category !== lastCategory) {
            write("### " + category + "\n\n");
            lastCategory = category;
          }
          renderExport(decl, prefix);
          renderComment(comment);
        }
        break;
      }

      case ts.SyntaxKind.TypeAliasDeclaration:
        console.log("TODO: type alias");
        break;

      case ts.SyntaxKind.InterfaceDeclaration:
        console.log("TODO: interface");
        break;

      // TODO: reference
    }
  }

  function renderClassNode(node: ts.ClassDeclaration) {
    write("```typescript\n");
    write("class " + node.name.getText(sourceFile));
    if (node.typeParameters) {
      write("<");
      write(node.typeParameters.map((t) => t.getFullText(sourceFile)).join(","));
      write(">");
    }
    write("\n```\n\n");
    const comment = parseComment(node);
    renderComment(comment);
    node.forEachChild(renderNode);
  }

  function parseComment(node: ts.Node): tsdoc.DocComment {
    const commentRanges: ts.CommentRange[] = (
      ts.getLeadingCommentRanges(srcTxt, node.pos) || []
    ).filter(
      (comment) =>
        srcTxt.charCodeAt(comment.pos + 1) === 0x2a /* ts.CharacterCodes.asterisk */ &&
        srcTxt.charCodeAt(comment.pos + 2) === 0x2a /* ts.CharacterCodes.asterisk */ &&
        srcTxt.charCodeAt(comment.pos + 3) !== 0x2f /* ts.CharacterCodes.slash */
    );
    if (commentRanges.length === 0) {
      return;
    }

    const customConfiguration = new tsdoc.TSDocConfiguration();

    const category = new tsdoc.TSDocTagDefinition({
      tagName: "@category",
      syntaxKind: tsdoc.TSDocTagSyntaxKind.BlockTag,
      allowMultiple: false,
    });
    customConfiguration.addTagDefinition(category);

    const parser = new tsdoc.TSDocParser(customConfiguration);
    const context = parser.parseRange(
      tsdoc.TextRange.fromStringRange(srcTxt, commentRanges[0].pos, commentRanges[0].end)
    );
    if (context.log.messages.length > 0) {
      console.log("Error in tsdoc comment");
      for (const m of context.log.messages) {
        const location = sourceFile.getLineAndCharacterOfPosition(m.textRange.pos);
        console.log(
          `${sourceFile.fileName}(${location.line + 1},${
            location.character + 1
          }): [TSDoc] ${m.toString()}`
        );
      }
      exit(1);
    }

    return context.docComment;
  }
}

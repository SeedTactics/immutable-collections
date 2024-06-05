import { exit } from "node:process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as cp from "node:child_process";
import ts from "typescript";
//import { SidebarsConfig } from "@docusaurus/plugin-content-docs";
import basePackage from "../package.json" with { type: "json" };

const majorMinorVersion = basePackage.version.substring(
  0,
  basePackage.version.lastIndexOf("."),
);

// List of all ts files to process into API docs

type DocFile = {
  readonly sidebarLabel: string;
  readonly docTitle: string;
  readonly tsFile: string;
  readonly singleClass: string | null;
};

const allFiles: ReadonlyArray<DocFile> = [
  {
    sidebarLabel: "Class API",
    docTitle: "Class-based API for Immutable TypeScript Collections",
    tsFile: "../src/api/classes.ts",
    singleClass: null,
  },
  {
    sidebarLabel: "HashMap",
    docTitle: "Immutable HashMap in Typescript",
    tsFile: "../src/api/hashmap.ts",
    singleClass: "HashMap",
  },
  {
    sidebarLabel: "HashSet",
    docTitle: "Immutable HashSet in TypeScript",
    tsFile: "../src/api/hashset.ts",
    singleClass: "HashSet",
  },
  {
    sidebarLabel: "OrderedMap",
    docTitle: "Immutable Balanced OrderedMap in TypeScript",
    tsFile: "../src/api/orderedmap.ts",
    singleClass: "OrderedMap",
  },
  {
    sidebarLabel: "OrderedSet",
    docTitle: "Immutable Balanced OrderedSet in TypeScript",
    tsFile: "../src/api/orderedset.ts",
    singleClass: "OrderedSet",
  },
  {
    sidebarLabel: "LazySeq",
    docTitle: "Utility Methods for Iterables",
    tsFile: "../src/lazyseq.ts",
    singleClass: "LazySeq",
  },
  {
    sidebarLabel: "HAMT",
    docTitle: "Function-based Immutable HashMap in Typescript",
    tsFile: "../src/data-structures/hamt.ts",
    singleClass: null,
  },
  {
    sidebarLabel: "Tree",
    docTitle: "Function-based Immutable Balanced Tree in Typescript",
    tsFile: "../src/data-structures/tree.ts",
    singleClass: null,
  },
];

// Calculate the git revision of the current commit
const gitRev = cp
  .execSync("git rev-parse HEAD")
  .toString()
  .replace("\n", "")
  .replace("\r", "");
const srcPrefix = `https://github.com/SeedTactics/immutable-collections/blob/${gitRev}/`;

// Create the versioned docs directory if it doesn't exist
if (!fs.existsSync(path.join("versioned_docs", "version-" + majorMinorVersion))) {
  console.log("Creating versioned docs directory");
  cp.execSync("pnpm docusaurus docs:version " + majorMinorVersion);
  fs.mkdirSync(path.join("versioned_docs", "version-" + majorMinorVersion, "api"));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const sidebar: { docsSidebar: unknown[] } = JSON.parse(
    fs.readFileSync(
      path.join("versioned_sidebars", "version-" + majorMinorVersion + "-sidebars.json"),
      "utf8",
    ),
  );
  sidebar["docsSidebar"].push({
    type: "category",
    label: "API",
    items: allFiles.map((f) => ({
      type: "doc" as const,
      id: "api/" + path.basename(f.tsFile, ".ts"),
      label: f.sidebarLabel,
      //description: f.docTitle,
    })),
  });
  fs.writeFileSync(
    path.join("versioned_sidebars", "version-" + majorMinorVersion + "-sidebars.json"),
    JSON.stringify(sidebar, null, 2),
  );
}

// Load the typescript code
const tsConfig = ts.parseJsonSourceFileConfigFileContent(
  ts.readJsonConfigFile(
    ts.findConfigFile(path.resolve(".."), (f) => ts.sys.fileExists(f), "tsconfig.json"),
    (f) => ts.sys.readFile(f),
  ),
  ts.sys,
  path.resolve("../"),
);
const program = ts.createProgram(tsConfig.fileNames, tsConfig.options);

// Emit all the docs
for (const d of allFiles) {
  console.log("Emitting " + d.tsFile);
  emitDocFile(d);
}

function emitDocFile(doc: DocFile) {
  const outHandle = fs.openSync(
    path.join(
      "versioned_docs",
      "version-" + majorMinorVersion,
      "api",
      path.basename(doc.tsFile, ".ts") + ".mdx",
    ),
    "w",
  );
  function write(s: string): void {
    fs.writeFileSync(outHandle, s);
  }
  const srcFile = program
    .getTypeChecker()
    .getSymbolAtLocation(program.getSourceFile(doc.tsFile))
    .getDeclarations()[0] as ts.SourceFile;

  const anchorCount = new Map<string, number>();
  let lastCategory: string | null = null;

  write("---\n");
  write(`id: ${path.basename(doc.tsFile, ".ts")}\n`);
  write(`title: ${doc.docTitle}\n`);
  write("---\n\n");
  write(`import Export from "@site/src/components/ApiExport";\n`);
  write(`import Summary from "@site/src/components/ApiSummary";\n`);
  write(`import Remarks from "@site/src/components/ApiRemarks";\n\n`);

  write(`# ${doc.docTitle}\n\n`);

  if (doc.singleClass) {
    srcFile.forEachChild((n) => {
      if (n.kind === ts.SyntaxKind.ClassDeclaration) {
        const d = n as ts.ClassDeclaration;
        if (d.name.getText() === doc.singleClass) {
          renderClassPage(d);
        }
      }
    });
  } else {
    renderModulePage(doc, srcFile);
  }
  fs.closeSync(outHandle);

  function renderDisplayParts(
    parts: string | ts.NodeArray<ts.JSDocComment> | undefined,
    onlyFirstParagraph: boolean = false,
  ): void {
    if (!parts) {
      return;
    }
    if (typeof parts === "string") {
      write(parts);
      return;
    }
    for (const part of parts) {
      if (part.kind === ts.SyntaxKind.JSDocLink) {
        let link = part.text;
        if (!link || link === "") {
          link = part.name?.getText();
        }
        if (!link || link === "") {
          console.log("INVALID Link in JSDoc");
        }
        const hashIdx = link.indexOf("#");

        let page: string | undefined = undefined;
        if (hashIdx >= 0) {
          page = path.basename(link.substring(0, hashIdx));
          link = link.substring(hashIdx + 1);
        }
        const linkRefs = link.split(".");
        const hash = linkRefs[linkRefs.length - 1];
        write(`[${link}](${page ?? ""}${hash ? "#" : ""}${hash})`);
      } else if (part.kind === ts.SyntaxKind.JSDocText) {
        if (onlyFirstParagraph && part.text.includes("\n\n")) {
          write(part.text.substring(0, part.text.indexOf("\n\n")));
          return;
        }
        write(part.text);
      } else {
        console.log("UNKNWON JSDoc Kind: " + part.kind.toString());
      }
    }
  }

  function renderJSDoc(d: ts.JSDoc | ts.JSDocTag): void {
    if (ts.isJSDoc(d)) {
      if (d.tags) {
        d.tags.forEach(renderJSDoc);
      }
    } else {
      if (
        d.tagName.getText() === "remarks" &&
        d.comment &&
        typeof d.comment === "string"
      ) {
        write(d.comment);
      }
      if (d.tagName.getText() === "remarks" && d.comment && Array.isArray(d.comment)) {
        renderDisplayParts(d.comment);
      }
    }
  }

  function renderDocComment(
    node: ts.NamedDeclaration,
    onlyFirstParagraph: boolean = false,
  ): void {
    const jsdocs = ts.getJSDocCommentsAndTags(node);
    const tags = ts.getJSDocTags(node);

    if (jsdocs.length === 0) {
      console.log("Missing documentation for " + node.name?.getText());
      return;
    }
    if (jsdocs.length > 1) {
      console.log("Invalid doc comment for " + node.name?.getText());
      exit(1);
    }
    const jsdoc = jsdocs[0];

    write("<Summary>\n\n");
    renderDisplayParts(jsdoc.comment);
    write("\n\n</Summary>\n\n");

    const remarks = tags.find((t) => t.tagName.getText() === "remarks");
    if (remarks) {
      write("<Remarks>\n\n");
      renderDisplayParts(remarks.comment, onlyFirstParagraph);
      write("\n\n");
      const example = tags.filter((b) => b.tagName.getText() === "example");
      if (example.length > 0) {
        write("<details>\n\n");
        for (const ex of example) {
          write("<summary>Example</summary>\n\n");
          write("<div>\n\n");
          renderDisplayParts(ex.comment);
          write("\n\n</div>\n\n");
        }
        write("</details>\n\n");
      }
      write("\n</Remarks>\n");
    }
    write("\n");
  }

  function renderExport(node: ts.NamedDeclaration): void {
    let anchor = node.name.getText().replace("[", "").replace("]", "").replace(".", "_");
    if (anchorCount.has(anchor)) {
      anchorCount.set(anchor, anchorCount.get(anchor) + 1);
      anchor = anchor + anchorCount.get(anchor).toString();
    } else {
      anchorCount.set(anchor, 1);
    }
    const file = path.relative(path.resolve(".."), node.getSourceFile().fileName);
    const line = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());

    const src = srcPrefix + file + "#L" + (line.line + 1).toString();
    write(`<Export anchor="${anchor}" src="${src}">\n\n`);
  }

  function renderSigExport(sig: ts.SignatureDeclaration, namePrefix: string): void {
    renderExport(sig);

    write("```typescript\n");

    if (namePrefix) {
      write(namePrefix);
      write(sig.name.getText());
    }
    if (sig.typeParameters) {
      write("<");
      write(sig.typeParameters.map((t) => t.getFullText()).join(","));
      write(">");
    }

    if (sig.parameters) {
      write("(");
      const params = sig.parameters.map((t) => t.getFullText()).join(",");
      write(params);
      // if some param has a newline, add a final newline before the close paren
      if (params.includes("\n")) write("\n");
      write(")");
    }
    write(":");
    if (!sig.type) {
      console.log("No type for " + sig.name.getText());
      exit(1);
    }
    write(sig.type.getFullText());
    write("\n```\n\n");
    write("</Export>\n\n");
  }

  function renderClassExport(cl: ts.ClassDeclaration): void {
    renderExport(cl);
    write("```typescript\n");
    write("class " + cl.name.getText());
    if (cl.typeParameters) {
      write("<");
      write(cl.typeParameters.map((t) => t.getFullText()).join(","));
      write(">");
    }
    write("\n```\n\n");
    write("</Export>\n\n");
  }

  function renderFull(node: ts.NamedDeclaration): void {
    renderExport(node);
    write("```typescript\n");
    write(node.getText());
    write("\n```\n\n");
    write("</Export>\n\n");
  }

  function renderCategory(node: ts.NamedDeclaration): void {
    const category = ts.getJSDocTags(node).find((n) => n.tagName.getText() === "category")
      ?.comment;
    if (!category) {
      return;
    }
    if (typeof category === "string" && category.length > 0) {
      if (category !== lastCategory) {
        write("### " + category + "\n\n");
        lastCategory = category;
      }
    } else {
      console.log("Invalid category for " + node.name?.getText());
      exit(1);
    }
  }

  function isInternal(node: ts.Node): boolean {
    const internal = ts
      .getJSDocTags(node)
      .find((t) => t.tagName.getText() === "internal");
    return !!internal;
  }

  function renderNode(node: ts.Node) {
    if (isInternal(node)) return;

    switch (node.kind) {
      case ts.SyntaxKind.ClassDeclaration: {
        const cl = node as ts.ClassDeclaration;
        renderCategory(cl);
        renderClassExport(cl);
        renderDocComment(cl, true);
        write(
          `[See full class details for ${cl.name.getText()}](./${cl.name
            .getText()
            .toLowerCase()})\n\n`,
        );
        break;
      }

      case ts.SyntaxKind.FunctionDeclaration:
      case ts.SyntaxKind.MethodDeclaration:
      case ts.SyntaxKind.ConstructSignature:
      case ts.SyntaxKind.GetAccessor:
      case ts.SyntaxKind.PropertyDeclaration: {
        const decl = node as ts.SignatureDeclaration;
        const modFlags = ts.getCombinedModifierFlags(decl);
        const isNonExportFunction =
          decl.kind === ts.SyntaxKind.FunctionDeclaration &&
          !(modFlags & ts.ModifierFlags.Export);
        if (!(modFlags & ts.ModifierFlags.Private) && !isNonExportFunction) {
          const prefix =
            node.kind === ts.SyntaxKind.FunctionDeclaration
              ? "function "
              : node.kind === ts.SyntaxKind.ConstructSignature
              ? "constructor "
              : modFlags & ts.ModifierFlags.Static
              ? "static "
              : "𝑜𝑏𝑗.";
          renderCategory(decl);
          renderSigExport(decl, prefix);
          renderDocComment(decl);
        }
        break;
      }

      case ts.SyntaxKind.TypeAliasDeclaration: {
        const alias = node as ts.TypeAliasDeclaration;
        const modFlags = ts.getCombinedModifierFlags(alias);
        if (modFlags & ts.ModifierFlags.Export) {
          renderCategory(alias);
          renderFull(alias);
          renderDocComment(alias);
        }
        break;
      }

      case ts.SyntaxKind.ExportDeclaration: {
        const ex = node as ts.ExportDeclaration;
        ex.exportClause?.forEachChild((n) => {
          const refFile = path.resolve(
            path.join(
              path.dirname(doc.tsFile),
              ex.moduleSpecifier.getText().replace(/"/g, "").replace(/\.js/, ".ts"),
            ),
          );
          const refModule = program
            .getTypeChecker()
            .getSymbolAtLocation(program.getSourceFile(refFile));
          const exp = refModule.exports.get(ts.escapeLeadingUnderscores(n.getText()));
          renderNode(exp.declarations[0]);
        });
        break;
      }
    }
  }

  function renderClassPage(node: ts.ClassDeclaration) {
    write("```typescript\n");
    write("class " + node.name.getText());
    if (node.typeParameters) {
      write("<");
      write(node.typeParameters.map((t) => t.getFullText()).join(","));
      write(">");
    }
    write("\n```\n\n");
    renderDocComment(node);
    node.forEachChild(renderNode);
  }

  function renderModulePage(doc: DocFile, node: ts.Node) {
    const firstChild = node.getChildAt(0).getChildAt(0);
    const jsdocs = ts.getJSDocCommentsAndTags(firstChild);
    jsdocs.forEach(renderJSDoc);
    write("\n\n");
    srcFile.forEachChild(renderNode);
  }
}

import {
  Application,
  PageEvent,
  ProjectReflection,
  Reflection,
  Renderer,
  Theme,
  UrlMapping,
  ReflectionKind,
  DeclarationReflection,
  DefaultTheme,
  Converter,
  SignatureReflection,
} from "typedoc";
import { onCreateSignature } from "./decl";
import { pageTemplate } from "./page";

function applyAnchors(reflection: Reflection, page: Reflection): void {
  if (!(reflection instanceof DeclarationReflection) && !(reflection instanceof SignatureReflection)) {
    return;
  }

  if (reflection.hasOwnDocument) {
    return;
  }

  if (reflection.url) {
    console.log(
      `Reflection ${reflection.name} already has a url ${reflection.url} when processing page ${page.name}`
    );
    return;
  }

  const anchor = DefaultTheme.getUrl(reflection, page);
  reflection.url = (page.url ?? "") + "#" + anchor;
  reflection.anchor = anchor;
  reflection.hasOwnDocument = false;

  reflection.traverse((child) => {
    applyAnchors(child, page);
    return true;
  });
}

class DocTheme extends Theme {
  constructor(renderer: Renderer) {
    super(renderer);
  }

  override render(page: PageEvent<Reflection>): string {
    return page.template(page) as string;
  }

  override getUrls(project: ProjectReflection): UrlMapping[] {
    const urls: UrlMapping<DeclarationReflection>[] = [];

    for (const child of project.children ?? []) {
      if (child.kind === ReflectionKind.Module) {
        child.url = "/docs/api/" + child.getAlias();
        child.hasOwnDocument = true;
        urls.push(new UrlMapping(child.getAlias() + ".mdx", child, pageTemplate));
      }

      for (const grandchild of child.children ?? []) {
        if (grandchild.kind === ReflectionKind.Class) {
          grandchild.url = "/docs/api/" + grandchild.getAlias();
          grandchild.hasOwnDocument = true;
          urls.push(new UrlMapping(grandchild.getAlias() + ".mdx", grandchild, pageTemplate));
        }
      }
    }

    for (const url of urls) {
      url.model.traverse((c) => {
        applyAnchors(c, url.model);
      });
    }

    return urls;
  }
}

export function load(app: Application) {
  app.converter.on(Converter.EVENT_CREATE_SIGNATURE, onCreateSignature);
  app.renderer.defineTheme("immutable-collections-docs", DocTheme);
}

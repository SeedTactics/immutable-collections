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
} from "typedoc";
import { pageTemplate } from "./page";

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
      DefaultTheme.applyAnchorUrl(url.model, url.model);
    }

    return urls;
  }
}

export function load(app: Application) {
  app.renderer.defineTheme("immutable-collections-docs", DocTheme);
}

import {
  Application,
  PageEvent,
  ProjectReflection,
  Reflection,
  Renderer,
  Theme,
  UrlMapping,
  ReflectionKind,
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
    const urls: UrlMapping[] = [];

    for (const child of project.children ?? []) {
      if (child.kind === ReflectionKind.Module) {
        urls.push(new UrlMapping(child.getAlias() + ".mdx", child, pageTemplate));
      }

      for (const grandchild of child.children ?? []) {
        if (grandchild.kind === ReflectionKind.Class) {
          urls.push(new UrlMapping(grandchild.getAlias() + ".mdx", grandchild, pageTemplate));
        }
      }
    }

    return urls;
  }
}

export function load(app: Application) {
  app.renderer.defineTheme("immutable-collections-docs", DocTheme);
}

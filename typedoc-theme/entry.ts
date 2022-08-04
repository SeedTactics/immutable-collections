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
import { classTemplate, pageTemplate } from "./layout";

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
        switch (child.getAlias()) {
          case "api_classes":
            urls.push(new UrlMapping("class-api.md", child, pageTemplate));
            break;
          case "data_structures_hamt":
            urls.push(new UrlMapping("hamt.md", child, pageTemplate));
            break;
          case "data_structures_tree":
            urls.push(new UrlMapping("tree.md", child, pageTemplate));
            break;
        }
      }

      for (const grandchild of child.children ?? []) {
        if (grandchild.kind === ReflectionKind.Class) {
          urls.push(new UrlMapping(grandchild.getAlias() + ".md", grandchild, classTemplate));
        }
      }
    }

    return urls;
  }
}

export function load(app: Application) {
  app.renderer.defineTheme("immutable-collections-docs", DocTheme);
}

import { Application, DefaultTheme } from "typedoc";

export function load(app: Application) {
  app.renderer.defineTheme("immutable-collection-docs", DefaultTheme);
}

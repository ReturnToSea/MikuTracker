// Stryker plugin for the React app: skips mutants that only change how things look.
// - Anything inside a className (Tailwind classes) or a style (sizes): a changed class is a real change, but
//   no automated test can judge it, so looks are checked by eye on screenshots instead.
// - Settings on chart components: none yet; charts arrive in v0.7.0, and their drawing settings
//   will be listed in CHART_PARTS (the data that goes into charts is tested in src/lib/).
import { declareValuePlugin, PluginKind } from "@stryker-mutator/api/plugin";

const CHART_PARTS = new Set([]);

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, "looks", {
    shouldIgnore(path) {
      const attr = path.find((p) => p.isJSXAttribute());
      if (!attr) return undefined;
      if (attr.node.name.name === "className" || attr.node.name.name === "style") return "Styling is checked by eye, not by tests";
      const element = attr.parentPath.node.name;
      if (element.type === "JSXIdentifier" && CHART_PARTS.has(element.name)) return "Chart drawing settings: jsdom doesn't draw charts";
      return undefined;
    },
  }),
];

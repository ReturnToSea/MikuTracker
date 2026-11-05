import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom can't draw on a canvas (it logs an error and returns null). Return null quietly, the
// same as a browser without canvas support; the drawing code handles that.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // jsdom doesn't scroll; browsers all have scrollIntoView. Record calls instead.
  Element.prototype.scrollIntoView = vi.fn();
  // Node 25's own localStorage (inactive without a file) hides jsdom's: a browser's, kept in memory and
  // empty every test (the Stats page's test mode keeps its test there, v4.1.0).
  Object.defineProperty(window, "localStorage", { configurable: true, value: memoryStorage() });
});
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // The theme lives on the page itself; start every test from the page's initial state.
  document.documentElement.dataset.theme = "ren";
  document.documentElement.removeAttribute("style");
  // What a page remembers for the browser tab (the Gear pages' picked character) starts empty every test.
  sessionStorage.clear();
});

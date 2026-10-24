import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom can't draw on a canvas (it logs an error and returns null). Return null quietly, the
// same as a browser without canvas support; the drawing code handles that.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  // jsdom doesn't scroll; browsers all have scrollIntoView. Record calls instead.
  Element.prototype.scrollIntoView = vi.fn();
});

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

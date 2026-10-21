import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom can't draw on a canvas (it logs an error and returns null). Return null quietly, the
// same as a browser without canvas support; the drawing code handles that.
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // The theme lives on the page itself; start every test from the page's initial state.
  document.documentElement.dataset.theme = "ren";
  document.documentElement.removeAttribute("style");
});

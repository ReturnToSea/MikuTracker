import { beforeEach, vi } from "vitest";

// No test may reach the network (Nexon above all): anything that tries gets a loud error instead.
// Tests that need Nexon pass a fake client (test/fixtures/nexon.ts).
beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("Tests must not reach the network: pass a fake Nexon client instead");
  });
});

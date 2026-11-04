import { describe, expect, it } from "vitest";
import { z } from "zod";
import { overlay, parseSaved } from "../src/services/saved";

describe("parseSaved", () => {
  const schema = z.strictObject({ a: z.number() });
  it("JSON passing the rules: read; none, not JSON, or not passing: null", () => {
    expect(parseSaved('{"a":1}', schema)).toEqual({ a: 1 });
    expect(parseSaved(undefined, schema)).toBeNull();
    expect(parseSaved('{"a":', schema)).toBeNull();
    expect(parseSaved('{"a":"x"}', schema)).toBeNull();
  });
});

describe("overlay", () => {
  const defaults = { n: 0, b: false, pick: null as string | null, inner: { x: 0, y: 0 } };
  it("each field the defaults have, from what's saved when it's the same kind, else the default's; fields the defaults lack left out", () => {
    expect(overlay(defaults, { n: 5, b: true, pick: "p", inner: { x: 2, y: "bad" }, gone: 1 })).toEqual({ n: 5, b: true, pick: "p", inner: { x: 2, y: 0 } });
  });
  it("a field missing (added since): the default's; a whole object missing or not an object: its defaults", () => {
    expect(overlay(defaults, { n: 5 })).toEqual({ n: 5, b: false, pick: null, inner: { x: 0, y: 0 } });
    expect(overlay(defaults, { n: 5, inner: 3 })).toEqual({ n: 5, b: false, pick: null, inner: { x: 0, y: 0 } });
    expect(overlay(defaults, "nonsense")).toEqual(defaults);
    expect(overlay(defaults, null)).toEqual(defaults);
    expect(overlay(defaults, { inner: [1, 2] }).inner).toEqual({ x: 0, y: 0 });
  });
  it("a null default takes what's saved, a missing one stays null; the defaults themselves untouched", () => {
    expect(overlay(defaults, { pick: 7 }).pick).toBe(7);
    expect(overlay(defaults, {}).pick).toBeNull();
    expect(defaults).toEqual({ n: 0, b: false, pick: null, inner: { x: 0, y: 0 } });
  });
});

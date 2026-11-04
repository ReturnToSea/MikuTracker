import type { z } from "zod";

// A page's input saved as JSON (HEXA, Familiars, Stats), read: undefined when there's none or it isn't JSON.
// Stryker disable BlockStatement: an empty catch returns undefined all the same
export function readJson(data: string | undefined): unknown {
  try {
    return JSON.parse(data!);
  } catch {
    return undefined;
  }
}
// Stryker restore BlockStatement
// The same through its rules, or null (none saved, not JSON, or no longer passing the rules).
export function parseSaved<S extends z.ZodType>(data: string | undefined, schema: S): z.infer<S> | null {
  const parsed = schema.safeParse(readJson(data));
  return parsed.success ? parsed.data : null;
}

// What of a saved value still fits the defaults' shape: each field the defaults have, taken from what's saved
// when it's the same kind (a number for a number, an object field by field; null where the default is null
// takes anything), else the default's. Fields the defaults don't have are left out. (So a page's input still
// reads after a field is added or removed: only what changed falls back.)
export function overlay<T>(defaults: T, saved: unknown): T {
  if (defaults !== null && typeof defaults === "object" && !Array.isArray(defaults)) {
    const from = saved !== null && typeof saved === "object" && !Array.isArray(saved) ? (saved as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, overlay(v, from[k])])) as T;
  }
  if (defaults === null) return (saved === undefined ? null : saved) as T;
  return (typeof saved === typeof defaults ? saved : defaults) as T;
}

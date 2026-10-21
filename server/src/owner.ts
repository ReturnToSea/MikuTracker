import type { Response } from "express";

// Whose data a request is about, decided in one place. There's one owner for now (no login);
// when login arrives, requireAuth will set the signed-in owner here instead, and nothing that
// reads currentOwner() needs to change.
export const SOLE_OWNER = "owner";

export function setOwner(res: Response, ownerId: string) {
  res.locals.ownerId = ownerId;
}

export function currentOwner(res: Response): string {
  const ownerId: unknown = res.locals.ownerId;
  if (typeof ownerId !== "string") throw new Error("No owner for this request (is requireAuth missing in front of this route?)");
  return ownerId;
}

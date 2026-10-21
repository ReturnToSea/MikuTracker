import type { NextFunction, Request, Response } from "express";
import { SOLE_OWNER, setOwner } from "../owner";

// Every API request passes through here. With no login yet (the server only listens on this
// Mac), every request belongs to the sole owner. When the server moves, this is where a session
// is checked: no valid session → 401, otherwise setOwner(res, <that user>).
export function requireAuth(_req: Request, res: Response, next: NextFunction) {
  setOwner(res, SOLE_OWNER);
  next();
}

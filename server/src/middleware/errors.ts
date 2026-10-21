import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client";
import { HttpError } from "../http";
import { NexonError, type NexonErrorKind } from "../nexon/errors";

// Nexon's problems, as HTTP: not found → 404, on another world → 409, can't be reached → 503,
// answered strangely (or the EXP table needs updating) → 502.
const NEXON_STATUS: Record<NexonErrorKind, number> = { "not-found": 404, "other-world": 409, unreachable: 503, changed: 502, "exp-table": 502 };

const PRISMA_ERRORS: Record<string, [number, string]> = {
  P2025: [404, "Not found"],
  P2002: [409, "Already exists"],
};

// Turns anything a route throws into a JSON answer with the right status. Unexpected errors are
// logged and answered with a plain 500 (no details leave the server).
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Invalid input",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof NexonError) return res.status(NEXON_STATUS[err.kind]).json({ error: err.message, kind: err.kind });
  if (err instanceof Prisma.PrismaClientKnownRequestError && PRISMA_ERRORS[err.code]) {
    const [status, error] = PRISMA_ERRORS[err.code]!;
    return res.status(status).json({ error });
  }
  // Stryker disable next-line ConditionalExpression: Express only calls this with a truthy error, and reading .type from any truthy value never throws; the check is for TypeScript
  const type = err instanceof Error && "type" in err ? err.type : undefined; // set by the body parser
  if (type === "entity.too.large") return res.status(413).json({ error: "That's too large to send" });
  if (type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON" });
  console.error(err);
  res.status(500).json({ error: "Server error" });
}

import { Router } from "express";
import { refreshStatus } from "../services/refresh";

// How the last refresh of Nexon's rankings went: /api/refresh
export const refreshRouter = Router();

// Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
refreshRouter.get("/", async (_req, res) => {
  res.json(await refreshStatus());
});

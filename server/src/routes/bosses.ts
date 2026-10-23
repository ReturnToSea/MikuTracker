import { bossBoardQuery, bossClearInput, bossPlanInput } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { bossBoard, saveBossPlan, setBossCleared } from "../services/bosses";

const idParam = z.coerce.number().int().positive();

export const bossesRouter = Router();

// Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
bossesRouter.get("/", async (req, res) => {
  res.json(await bossBoard(currentOwner(res), bossBoardQuery.parse(req.query).world));
});

// A character's plan, replaced as a whole.
bossesRouter.put("/:characterId/plan", async (req, res) => {
  await saveBossPlan(currentOwner(res), idParam.parse(req.params.characterId), bossPlanInput.parse(req.body).plan);
  res.status(204).end();
});

// Ticking or unticking one of its planned bosses.
bossesRouter.put("/:characterId/clears/:boss", async (req, res) => {
  await setBossCleared(currentOwner(res), idParam.parse(req.params.characterId), req.params.boss, bossClearInput.parse(req.body).cleared);
  res.status(204).end();
});

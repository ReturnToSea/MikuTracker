import { statsInput, statsTryInput } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { saveStats, statsBoard, statsTry } from "../services/stats";

const idParam = z.coerce.number().int().positive();

export const statsRouter = Router();

// One character's Stats page, worked out.
statsRouter.get("/:characterId", async (req, res) => {
  res.json(await statsBoard(currentOwner(res), idParam.parse(req.params.characterId)));
});

// One character's Stats page, as typed.
statsRouter.put("/:characterId", async (req, res) => {
  await saveStats(currentOwner(res), idParam.parse(req.params.characterId), statsInput.parse(req.body));
  res.status(204).end();
});

// Test mode (v4.1.0): the page worked out for a sheet, level and HEXA levels as typed. Nothing is saved.
statsRouter.post("/:characterId/try", async (req, res) => {
  res.json(await statsTry(currentOwner(res), idParam.parse(req.params.characterId), statsTryInput.parse(req.body)));
});

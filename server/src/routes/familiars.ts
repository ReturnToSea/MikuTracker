import { familiarInput } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { familiarBoard, saveFamiliars } from "../services/familiars";

const idParam = z.coerce.number().int().positive();

export const familiarsRouter = Router();

// One character's familiars and badges, with their totals.
familiarsRouter.get("/:characterId", async (req, res) => {
  res.json(await familiarBoard(currentOwner(res), idParam.parse(req.params.characterId)));
});

// One character's familiars and badges, as typed.
familiarsRouter.put("/:characterId", async (req, res) => {
  await saveFamiliars(currentOwner(res), idParam.parse(req.params.characterId), familiarInput.parse(req.body));
  res.status(204).end();
});

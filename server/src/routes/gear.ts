import { gearInput, gearQuery } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { gearBoard, saveGear } from "../services/gear";

const idParam = z.coerce.number().int().positive();

export const gearRouter = Router();

// Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
gearRouter.get("/", async (req, res) => {
  res.json(await gearBoard(currentOwner(res), gearQuery.parse(req.query).world));
});

// One slot of a character's equipment window.
gearRouter.put("/:characterId/:slot", async (req, res) => {
  await saveGear(currentOwner(res), idParam.parse(req.params.characterId), req.params.slot, gearInput.parse(req.body));
  res.status(204).end();
});

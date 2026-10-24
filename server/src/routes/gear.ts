import { gearDetailsInput, gearInput, gearOptionsQuery, gearQuery, statValuesInput } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { gearBoard, listedItemOptions, otherItemOptions, saveGear, saveGearDetails, saveStatValues } from "../services/gear";

const idParam = z.coerce.number().int().positive();

export const gearRouter = Router();

// Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
gearRouter.get("/", async (req, res) => {
  res.json(await gearBoard(currentOwner(res), gearQuery.parse(req.query).world));
});

// What can be set on an item (stars, flames, potential, hammers): a listed one or a typed one.
gearRouter.get("/options", (req, res) => {
  const q = gearOptionsQuery.parse(req.query);
  res.json("item" in q ? listedItemOptions(q.item) : otherItemOptions(q));
});

// What each stat is worth to a character (before the slot route, which would take "stat-values" as a slot).
gearRouter.put("/:characterId/stat-values", async (req, res) => {
  await saveStatValues(currentOwner(res), idParam.parse(req.params.characterId), statValuesInput.parse(req.body));
  res.status(204).end();
});

// An item's stars, flames, potential and hammers.
gearRouter.put("/:characterId/:slot/details", async (req, res) => {
  await saveGearDetails(currentOwner(res), idParam.parse(req.params.characterId), req.params.slot, gearDetailsInput.parse(req.body));
  res.status(204).end();
});

// One slot of a character's equipment window.
gearRouter.put("/:characterId/:slot", async (req, res) => {
  await saveGear(currentOwner(res), idParam.parse(req.params.characterId), req.params.slot, gearInput.parse(req.body));
  res.status(204).end();
});

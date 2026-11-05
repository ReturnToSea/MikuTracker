import { flamesQuery, gearDetailsInput, gearInput, gearOptionsQuery, gearQuery, potentialItemQuery, potentialQuery, starForceItemQuery, upgradesQuery, starForceQuery, statValuesInput } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { flameGraph, flamesBoard } from "../services/flames";
import { gearBoard, listedItemOptions, otherItemOptions, saveGear, saveGearDetails } from "../services/gear";
import { saveStatValues } from "../services/statValues";
import { potentialBoard, potentialGraph } from "../services/potential";
import { starForceBoard, starForceDetail } from "../services/starForce";
import { upgradesBoard } from "../services/upgrades";

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

// The Flames page: a character's flameable items with their scores and costs, and one item's graph.
gearRouter.get("/:characterId/flames", async (req, res) => {
  res.json(await flamesBoard(currentOwner(res), idParam.parse(req.params.characterId), flamesQuery.parse(req.query).budget));
});
gearRouter.get("/:characterId/flames/:slot", async (req, res) => {
  res.json(await flameGraph(currentOwner(res), idParam.parse(req.params.characterId), req.params.slot));
});

// The Star Force page: a character's items that can take more stars, and one item for a target star.
gearRouter.get("/:characterId/starforce", async (req, res) => {
  const q = starForceQuery.parse(req.query);
  res.json(await starForceBoard(currentOwner(res), idParam.parse(req.params.characterId), q.events, q.budget));
});
gearRouter.get("/:characterId/starforce/:slot", async (req, res) => {
  const q = starForceItemQuery.parse(req.query);
  res.json(await starForceDetail(currentOwner(res), idParam.parse(req.params.characterId), req.params.slot, q.events, q.target));
});

// The Potential page: a character's items that can have potential with what cubes would do, and one
// item's graph (with the cost of reaching a score, when one is asked for).
gearRouter.get("/:characterId/potential", async (req, res) => {
  const q = potentialQuery.parse(req.query);
  res.json(await potentialBoard(currentOwner(res), idParam.parse(req.params.characterId), q.events, q.budget));
});
gearRouter.get("/:characterId/potential/:slot", async (req, res) => {
  const q = potentialItemQuery.parse(req.query);
  res.json(await potentialGraph(currentOwner(res), idParam.parse(req.params.characterId), req.params.slot, q.events, q.target));
});

// The Upgrades page: each item's next step in each system, cheapest per 1% final damage first.
gearRouter.get("/:characterId/upgrades", async (req, res) => {
  const q = upgradesQuery.parse(req.query);
  res.json(await upgradesBoard(currentOwner(res), idParam.parse(req.params.characterId), q.sf, q.cubes));
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

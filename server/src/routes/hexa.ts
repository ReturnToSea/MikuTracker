import { hexaInput, hexaQuery } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { hexaBoard, hexaTabs, saveHexa } from "../services/hexa";

const idParam = z.coerce.number().int().positive();

export const hexaRouter = Router();

// The HEXA page's character tabs for a world.
// Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
hexaRouter.get("/", async (req, res) => {
  res.json(await hexaTabs(currentOwner(res), hexaQuery.parse(req.query).world));
});

// One character's HEXA, worked out.
hexaRouter.get("/:characterId", async (req, res) => {
  res.json(await hexaBoard(currentOwner(res), idParam.parse(req.params.characterId)));
});

// One character's HEXA, as typed.
hexaRouter.put("/:characterId", async (req, res) => {
  await saveHexa(currentOwner(res), idParam.parse(req.params.characterId), hexaInput.parse(req.body));
  res.status(204).end();
});

import { symbolInput, symbolsQuery } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import { currentOwner } from "../owner";
import { saveSymbol, symbolsBoard } from "../services/symbols";

const idParam = z.coerce.number().int().positive();

export const symbolsRouter = Router();

// Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
symbolsRouter.get("/", async (req, res) => {
  res.json(await symbolsBoard(currentOwner(res), symbolsQuery.parse(req.query).world));
});

// One symbol of a character, as typed.
symbolsRouter.put("/:characterId/:symbol", async (req, res) => {
  await saveSymbol(currentOwner(res), idParam.parse(req.params.characterId), req.params.symbol, symbolInput.parse(req.body));
  res.status(204).end();
});

import { addCharacterInput, characterListQuery, reorderInput } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import type { NexonClient } from "../nexon";
import { currentOwner } from "../owner";
import { addCharacter, deleteCharacter, listCharacters, reorderCharacters, selectCharacter } from "../services/characters";

const idParam = z.coerce.number().int().positive();

export function charactersRouter(nexon: () => NexonClient) {
  const router = Router();

  // Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
  router.get("/", async (req, res) => {
    res.json(await listCharacters(currentOwner(res), characterListQuery.parse(req.query).world));
  });

  // Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
  router.post("/", async (req, res) => {
    const { world, name } = addCharacterInput.parse(req.body);
    res.status(201).json(await addCharacter(currentOwner(res), world, name, nexon()));
  });

  router.put("/order", async (req, res) => {
    const { world, ids } = reorderInput.parse(req.body);
    res.json(await reorderCharacters(currentOwner(res), world, ids));
  });

  router.post("/:id/select", async (req, res) => {
    await selectCharacter(currentOwner(res), idParam.parse(req.params.id));
    res.status(204).end();
  });

  router.delete("/:id", async (req, res) => {
    await deleteCharacter(currentOwner(res), idParam.parse(req.params.id));
    res.status(204).end();
  });

  return router;
}

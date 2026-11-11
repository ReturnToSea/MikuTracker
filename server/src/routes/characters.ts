import { addCharacterInput, characterListQuery, editCharacterInput, reorderInput } from "@miku/shared";
import { Router } from "express";
import { z } from "zod";
import type { NexonClient } from "../nexon";
import { currentOwner } from "../owner";
import { addByHand, addCharacter, deleteCharacter, editCharacter, listCharacters, reorderCharacters, selectCharacter } from "../services/characters";
import { characterProgress } from "../services/progress";

const idParam = z.coerce.number().int().positive();

export function charactersRouter(nexon: () => NexonClient) {
  const router = Router();

  // Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
  router.get("/", async (req, res) => {
    res.json(await listCharacters(currentOwner(res), characterListQuery.parse(req.query).world));
  });

  // Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
  router.post("/", async (req, res) => {
    const input = addCharacterInput.parse(req.body);
    const owner = currentOwner(res);
    const { world, name, job, level } = input;
    res.status(201).json(job !== undefined ? await addByHand(owner, world, name, job, level!) : await addCharacter(owner, world, name, nexon()));
  });

  router.put("/order", async (req, res) => {
    const { world, ids } = reorderInput.parse(req.body);
    res.json(await reorderCharacters(currentOwner(res), world, ids));
  });

  router.patch("/:id", async (req, res) => {
    res.json(await editCharacter(currentOwner(res), idParam.parse(req.params.id), editCharacterInput.parse(req.body)));
  });

  router.post("/:id/select", async (req, res) => {
    await selectCharacter(currentOwner(res), idParam.parse(req.params.id));
    res.status(204).end();
  });

  router.get("/:id/progress", async (req, res) => {
    res.json(await characterProgress(currentOwner(res), idParam.parse(req.params.id)));
  });

  router.delete("/:id", async (req, res) => {
    await deleteCharacter(currentOwner(res), idParam.parse(req.params.id));
    res.status(204).end();
  });

  return router;
}

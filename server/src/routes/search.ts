import { searchQuery } from "@miku/shared";
import { Router } from "express";
import type { NexonClient } from "../nexon";
import { currentOwner } from "../owner";
import { searchCharacter } from "../services/search";

// Looking a character up on a world before adding it: /api/search?world=45&name=MikuBeam. The
// answer includes the avatar as image data, so the page can show it without contacting Nexon.
export function searchRouter(nexon: () => NexonClient) {
  const router = Router();
  // Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
  router.get("/", async (req, res) => {
    const { world, name } = searchQuery.parse(req.query);
    res.json(await searchCharacter(currentOwner(res), name, world, nexon()));
  });
  return router;
}

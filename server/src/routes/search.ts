import { searchQuery } from "@miku/shared";
import { Router } from "express";
import type { NexonClient } from "../nexon";

// Looking a character up on a world before adding it: /api/search?world=45&name=MikuBeam.
export function searchRouter(nexon: () => NexonClient) {
  const router = Router();
  // Stryker disable next-line StringLiteral: Express treats "" the same as "/" for a router's root
  router.get("/", async (req, res) => {
    const { world, name } = searchQuery.parse(req.query);
    res.json(await nexon().lookUp(name, world));
  });
  return router;
}

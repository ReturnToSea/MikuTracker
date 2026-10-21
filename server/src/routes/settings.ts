import { settingsInput } from "@miku/shared";
import { Router } from "express";
import { currentOwner } from "../owner";
import { getSettings, updateSettings } from "../services/settings";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  res.json(await getSettings(currentOwner(res)));
});

settingsRouter.put("/", async (req, res) => {
  res.json(await updateSettings(currentOwner(res), settingsInput.parse(req.body)));
});

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { THEMES, type ThemeId } from "@miku/shared";
import { Router } from "express";
import { getConfig } from "../config";

// Theme art (background images) lives in the data folder, never in git: <theme>.png, .jpg or
// .webp. A theme without art draws its own background instead.
export const ART_TYPES = [".png", ".jpg", ".webp"];

// Where each theme's art can be loaded from, or null. The file's modification time is part of
// the address, so replacing the picture shows the new one instead of a cached old one.
export function themeArt(folder: string): Record<ThemeId, string | null> {
  const found = {} as Record<ThemeId, string | null>;
  for (const theme of THEMES) {
    const file = ART_TYPES.map((ext) => `${theme}${ext}`).find((name) => existsSync(path.join(folder, name)));
    found[theme] = file ? `/theme-art/${file}?v=${Math.round(statSync(path.join(folder, file)).mtimeMs)}` : null;
  }
  return found;
}

export const themeArtRouter = Router();

themeArtRouter.get("/", (_req, res) => {
  res.json(themeArt(getConfig().themeArtDir));
});

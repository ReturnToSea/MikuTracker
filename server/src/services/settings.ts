import { MVP_TIERS, type SettingsInput } from "@miku/shared";
import { db } from "../db";

export interface SettingsView {
  theme: string;
  worldId: number;
  blackFlamePrice: number; // meso per Black Flame (the Flames page)
  mvp: (typeof MVP_TIERS)[number]; // the MVP tier (the Star Force page)
}

// (an MVP tier the list doesn't know, say from a hand-edited database: none)
const view = ({ theme, worldId, blackFlamePrice, mvp }: Omit<SettingsView, "mvp"> & { mvp: string }): SettingsView => ({ theme, worldId, blackFlamePrice, mvp: MVP_TIERS.find((m) => m === mvp) ?? "none" });

// An owner's settings, created with the defaults the first time they're read.
export async function getSettings(ownerId: string): Promise<SettingsView> {
  return view(await db().settings.upsert({ where: { ownerId }, create: { ownerId }, update: {} }));
}

export async function updateSettings(ownerId: string, input: SettingsInput): Promise<SettingsView> {
  return view(await db().settings.upsert({ where: { ownerId }, create: { ownerId, ...input }, update: input }));
}

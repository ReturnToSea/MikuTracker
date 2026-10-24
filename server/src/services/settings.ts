import type { SettingsInput } from "@miku/shared";
import { db } from "../db";

export interface SettingsView {
  theme: string;
  worldId: number;
  blackFlamePrice: number; // meso per Black Flame (the Flames page)
}

const view = ({ theme, worldId, blackFlamePrice }: SettingsView): SettingsView => ({ theme, worldId, blackFlamePrice });

// An owner's settings, created with the defaults the first time they're read.
export async function getSettings(ownerId: string): Promise<SettingsView> {
  return view(await db().settings.upsert({ where: { ownerId }, create: { ownerId }, update: {} }));
}

export async function updateSettings(ownerId: string, input: SettingsInput): Promise<SettingsView> {
  return view(await db().settings.upsert({ where: { ownerId }, create: { ownerId, ...input }, update: input }));
}

import type { SettingsInput } from "@miku/shared";
import { db } from "../db";

export interface SettingsView {
  theme: string;
  worldId: number;
}

const view = ({ theme, worldId }: SettingsView): SettingsView => ({ theme, worldId });

// An owner's settings, created with the defaults the first time they're read.
export async function getSettings(ownerId: string): Promise<SettingsView> {
  return view(await db().settings.upsert({ where: { ownerId }, create: { ownerId }, update: {} }));
}

export async function updateSettings(ownerId: string, input: SettingsInput): Promise<SettingsView> {
  return view(await db().settings.upsert({ where: { ownerId }, create: { ownerId, ...input }, update: input }));
}

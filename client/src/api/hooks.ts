import type { AddCharacterInput, BossPlanInput, SettingsInput } from "@miku/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { withTick } from "../lib/bosses";
import { api } from "./client";
import type { BossBoard, CharacterList, CharacterView, ExpTableView, ProgressView, RefreshStatus, SearchResult, SettingsView, ThemeArt } from "./types";

export const keys = {
  settings: ["settings"],
  themeArt: ["theme-art"],
  expTable: ["exp-table"],
  characters: (world: number) => ["characters", world],
  refresh: ["refresh"],
  progress: (id: number) => ["progress", id],
  bosses: (world: number) => ["bosses", world],
} as const;

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api<SettingsView>("/settings") });
export const useThemeArt = () => useQuery({ queryKey: keys.themeArt, queryFn: () => api<ThemeArt>("/theme-art") });
// The table only changes with a new version of the app, so it's loaded once per visit.
export const useExpTable = () => useQuery({ queryKey: keys.expTable, queryFn: () => api<ExpTableView>("/exp-table"), staleTime: Infinity });
// How the last check of Nexon went; asked again every minute so "Checked …" stays current. When a
// new check has finished, the characters and their EXP are loaded again (today's bar grows).
export function useRefreshStatus() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: keys.refresh, queryFn: () => api<RefreshStatus>("/refresh"), refetchInterval: 60_000 });
  const finished = status.data && String(status.data.last?.finishedAt ?? null);
  const seen = useRef<string | undefined>(undefined);
  // Runs when the answer changes: from the second answer on, that means a check finished (or started).
  useEffect(() => {
    if (seen.current !== undefined) {
      void qc.invalidateQueries({ queryKey: ["characters"] });
      void qc.invalidateQueries({ queryKey: ["progress"] });
      void qc.invalidateQueries({ queryKey: ["bosses"] });
    }
    seen.current = finished;
  }, [finished, qc]);
  return status;
}
// A character's EXP per day, stats and time to level.
export const useProgress = (id: number) => useQuery({ queryKey: keys.progress(id), queryFn: () => api<ProgressView>(`/characters/${id}/progress`) });
export const useCharacters = (world: number) => useQuery({ queryKey: keys.characters(world), queryFn: () => api<CharacterList>(`/characters?world=${world}`) });

// Saving settings: the saved settings come back from the server and replace the cached ones.
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => api<SettingsView>("/settings", { method: "PUT", body: input }),
    onSuccess: (saved) => qc.setQueryData(keys.settings, saved),
  });
}

// Looking a character up in Nexon's rankings (through our server, which sends the avatar along).
export const useSearch = () =>
  useMutation({ mutationFn: ({ world, name }: AddCharacterInput) => api<SearchResult>(`/search?world=${world}&name=${encodeURIComponent(name)}`) });

// Changes to a world's characters reload that world's list, and its Bosses tab (which lists them).
function useCharacterChange<I, O>(world: number, send: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: keys.characters(world) }), qc.invalidateQueries({ queryKey: keys.bosses(world) })]),
  });
}

export const useAddCharacter = (world: number) => useCharacterChange(world, (name: string) => api<CharacterView>("/characters", { method: "POST", body: { world, name } }));
export const useSelectCharacter = (world: number) => useCharacterChange(world, (id: number) => api<void>(`/characters/${id}/select`, { method: "POST" }));
export const useDeleteCharacter = (world: number) => useCharacterChange(world, (id: number) => api<void>(`/characters/${id}`, { method: "DELETE" }));

export const useReorderCharacters = (world: number) =>
  useCharacterChange(world, (ids: number[]) => api<CharacterList>("/characters/order", { method: "PUT", body: { world, ids } }));

// The Bosses tab of a world; saving a plan loads it again.
export const useBossBoard = (world: number) => useQuery({ queryKey: keys.bosses(world), queryFn: () => api<BossBoard>(`/bosses?world=${world}`) });

function useBossChange<I>(world: number, send: (input: I) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: send, onSuccess: () => qc.invalidateQueries({ queryKey: keys.bosses(world) }) });
}

export const useSaveBossPlan = (world: number) =>
  useBossChange(world, ({ id, plan }: { id: number; plan: BossPlanInput["plan"] }) => api<void>(`/bosses/${id}/plan`, { method: "PUT", body: { plan } }));

// A tick shows at once, and ticks are sent one at a time in the order they were clicked, so a
// quick untick right after a tick can't be overtaken by it. Then the board is loaded again.
export function useSetBossCleared(world: number) {
  const qc = useQueryClient();
  return useMutation({
    // Stryker disable next-line StringLiteral: any fixed name makes one queue
    scope: { id: "boss-ticks" },
    mutationFn: ({ id, boss, cleared }: { id: number; boss: string; cleared: boolean }) => api<void>(`/bosses/${id}/clears/${boss}`, { method: "PUT", body: { cleared } }),
    onMutate: async ({ id, boss, cleared }) => {
      await qc.cancelQueries({ queryKey: keys.bosses(world) }); // a load already on its way would undo it
      qc.setQueryData<BossBoard>(keys.bosses(world), (b) => b && withTick(b, id, boss, cleared));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.bosses(world) }),
  });
}

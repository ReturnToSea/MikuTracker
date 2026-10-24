import type { AddCharacterInput, BossPlanInput, CustomTaskInput, GearDetailsInput, GearInput, SettingsInput, StatValuesInput, SymbolInput } from "@miku/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { withTick } from "../lib/bosses";
import { customNumber, withTaskDone } from "../lib/checklist";
import { detailsAfter, withGear } from "../lib/gear";
import { api } from "./client";
import type { BossBoard, CharacterList, ChecklistBoard, DetailOptions, GearBoard, SymbolsBoard, CharacterView, ExpTableView, ProgressView, RefreshStatus, SearchResult, SettingsView, ThemeArt } from "./types";

export const keys = {
  settings: ["settings"],
  themeArt: ["theme-art"],
  expTable: ["exp-table"],
  characters: (world: number) => ["characters", world],
  refresh: ["refresh"],
  progress: (id: number) => ["progress", id],
  bosses: (world: number) => ["bosses", world],
  checklist: (world: number) => ["checklist", world],
  symbols: (world: number) => ["symbols", world],
  gear: (world: number) => ["gear", world],
  gearOptions: (query: string | null) => ["gear-options", query],
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
      void qc.invalidateQueries({ queryKey: ["checklist"] });
      void qc.invalidateQueries({ queryKey: ["symbols"] });
      void qc.invalidateQueries({ queryKey: ["gear"] });
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

// Changes to a world's characters reload that world's list. (The Bosses and Checklist tabs aren't
// on screen while characters change on Home, and load fresh when opened.)
function useCharacterChange<I, O>(world: number, send: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: send, onSuccess: () => qc.invalidateQueries({ queryKey: keys.characters(world) }) });
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

// The checklist of a world. Saving a plan or a custom task loads it again (a custom task, and a
// per-account limit, can show on both worlds, so every world's).
export const useChecklist = (world: number) => useQuery({ queryKey: keys.checklist(world), queryFn: () => api<ChecklistBoard>(`/checklist?world=${world}`) });

function useChecklistChange<I, O>(send: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: send, onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist"] }) });
}

export const useSaveChecklistPlan = () => useChecklistChange(({ id, tasks }: { id: number; tasks: string[] }) => api<void>(`/checklist/${id}/plan`, { method: "PUT", body: { tasks } }));
export const useSaveCustomTask = () =>
  useChecklistChange(({ id, task }: { id: string | null; task: CustomTaskInput }) =>
    id ? api<unknown>(`/checklist/tasks/${customNumber(id)}`, { method: "PUT", body: task }) : api<unknown>("/checklist/tasks", { method: "POST", body: task }),
  );
export const useDeleteCustomTask = () => useChecklistChange((id: string) => api<void>(`/checklist/tasks/${customNumber(id)}`, { method: "DELETE" }));

// A tick shows at once, and ticks are sent one at a time in the order they were clicked (as on
// the Bosses tab). Then every checklist loads again, with who used the limits.
export function useSetTaskDone(world: number) {
  const qc = useQueryClient();
  return useMutation({
    // Stryker disable next-line StringLiteral: any fixed name makes one queue
    scope: { id: "checklist-ticks" },
    mutationFn: ({ id, task, done }: { id: number; task: string; done: boolean }) => api<void>(`/checklist/${id}/ticks/${task}`, { method: "PUT", body: { done } }),
    onMutate: async ({ id, task, done }) => {
      await qc.cancelQueries({ queryKey: keys.checklist(world) });
      qc.setQueryData<ChecklistBoard>(keys.checklist(world), (b) => b && withTaskDone(b, id, task, done));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["checklist"] }),
  });
}

// The symbol calculator of a world.
export const useSymbols = (world: number) => useQuery({ queryKey: keys.symbols(world), queryFn: () => api<SymbolsBoard>(`/symbols?world=${world}`) });

// Saving one symbol as typed: shown at once, sent one at a time in order, then the board loads
// again (so a refused value goes back to what's saved).
export function useSaveSymbol(world: number) {
  const qc = useQueryClient();
  return useMutation({
    // Stryker disable next-line StringLiteral: any fixed name makes one queue
    scope: { id: "symbols" },
    mutationFn: ({ id, symbol, state }: { id: number; symbol: string; state: SymbolInput }) => api<void>(`/symbols/${id}/${symbol}`, { method: "PUT", body: state }),
    onMutate: async ({ id, symbol, state }) => {
      await qc.cancelQueries({ queryKey: keys.symbols(world) });
      qc.setQueryData<SymbolsBoard>(keys.symbols(world), (b) => b && { ...b, characters: b.characters.map((c) => (c.id === id ? { ...c, symbols: { ...c.symbols, [symbol]: state } } : c)) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.symbols(world) }),
  });
}

// The gear tab of a world.
export const useGear = (world: number) => useQuery({ queryKey: keys.gear(world), queryFn: () => api<GearBoard>(`/gear?world=${world}`) });

// Putting an item in a slot (or a typed one, or emptying it): shown at once, sent one at a time in
// order, then the board loads again (so a refused item goes back to what's saved).
export function useSaveGear(world: number) {
  const qc = useQueryClient();
  return useMutation({
    // Stryker disable next-line StringLiteral: any fixed name makes one queue
    scope: { id: "gear" },
    mutationFn: ({ id, slot, input }: { id: number; slot: string; input: GearInput }) => api<void>(`/gear/${id}/${slot}`, { method: "PUT", body: input }),
    onMutate: async ({ id, slot, input }) => {
      await qc.cancelQueries({ queryKey: keys.gear(world) });
      qc.setQueryData<GearBoard>(keys.gear(world), (b) => b && { ...b, characters: b.characters.map((c) => (c.id === id ? { ...c, equipped: withGear(c.equipped, slot, input), details: detailsAfter(c, slot, input) } : c)) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.gear(world) }),
  });
}

// What can be set on an item (a listed one: "item=<key>"; a typed one: what it is). The figures only
// change with a new version of the app, so each is loaded once per visit.
export const useGearOptions = (query: string | null) =>
  useQuery({ queryKey: keys.gearOptions(query), queryFn: () => api<DetailOptions>(`/gear/options?${query}`), enabled: query !== null, staleTime: Infinity });

// Saving an item's details (Save): shown at once, sent in order with the other gear saves, then the
// board loads again (so a refused save goes back to what's saved).
export function useSaveGearDetails(world: number) {
  const qc = useQueryClient();
  return useMutation({
    // Stryker disable next-line StringLiteral: any fixed name makes one queue
    scope: { id: "gear" },
    mutationFn: ({ id, slot, details }: { id: number; slot: string; details: GearDetailsInput }) => api<void>(`/gear/${id}/${slot}/details`, { method: "PUT", body: details }),
    onMutate: async ({ id, slot, details }) => {
      await qc.cancelQueries({ queryKey: keys.gear(world) });
      qc.setQueryData<GearBoard>(keys.gear(world), (b) => b && { ...b, characters: b.characters.map((c) => (c.id === id ? { ...c, details: { ...c.details, [slot]: details } } : c)) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.gear(world) }),
  });
}

// Saving a character's stat values, the same way.
export function useSaveStatValues(world: number) {
  const qc = useQueryClient();
  return useMutation({
    // Stryker disable next-line StringLiteral: any fixed name makes one queue
    scope: { id: "gear" },
    mutationFn: ({ id, values }: { id: number; values: StatValuesInput }) => api<void>(`/gear/${id}/stat-values`, { method: "PUT", body: values }),
    onMutate: async ({ id, values }) => {
      await qc.cancelQueries({ queryKey: keys.gear(world) });
      qc.setQueryData<GearBoard>(keys.gear(world), (b) => b && { ...b, characters: b.characters.map((c) => (c.id === id ? { ...c, statValues: values } : c)) });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.gear(world) }),
  });
}

import { type AddCharacterInput, type BossPlanInput, countedValues, type CustomTaskInput, type FamiliarInput, type StatsInput, type GearDetailsInput, type GearInput, type HexaInput, type SettingsInput, type StatsTryInput, type StatValuesTyped, type SymbolInput } from "@miku/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { withTick } from "../lib/bosses";
import { customNumber, withTaskDone } from "../lib/checklist";
import { detailsAfter, withGear } from "../lib/gear";
import { api } from "./client";
import type { BossBoard, CharacterList, ChecklistBoard, DetailOptions, FamiliarBoard, StatsBoard, FlameGraph, FlamesBoard, GearBoard, HexaBoard, HexaTabs, PotentialBoard, PotentialGraph, StarForceBoard, UpgradesBoard, StarForceDetail, SymbolsBoard, CharacterView, ExpTableView, ProgressView, RefreshStatus, SearchResult, SettingsView, ThemeArt } from "./types";

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
  flames: (id: number, budget: number) => ["flames", id, budget],
  flameGraph: (id: number, slot: string) => ["flames", id, "graph", slot],
  starForce: (id: number, events: string, budget: number) => ["starforce", id, events, budget],
  starForceDetail: (id: number, slot: string, events: string, target: number) => ["starforce", id, "detail", slot, events, target],
  potential: (id: number, events: string, budget: number) => ["potential", id, events, budget],
  upgrades: (id: number, sf: string, cubes: string) => ["upgrades", id, sf, cubes],
  potentialGraph: (id: number, slot: string, events: string, target: number | null) => ["potential", id, "graph", slot, events, target],
  hexaTabs: (world: number) => ["hexa-tabs", world],
  hexa: (id: number) => ["hexa", id],
  familiars: (id: number) => ["familiars", id],
  stats: (id: number) => ["stats", id],
  statsTry: (id: number, sheet: string) => ["stats-try", id, sheet],
} as const;
// What a character's stat values are worked out from (v4.1.0): its Stats page and HEXA levels; a change
// there changes the gear pages' numbers.
const GEAR_PAGES: (readonly unknown[])[] = [["gear"], ["flames"], ["starforce"], ["potential"], ["upgrades"]];
// What its gear and Sacred symbols change: those, HEXA's (HEXA Stat's damage, v3.1.0), and the Stats page
// and a test of it (the equipped hat's cooldown, the sacred symbol buff and each boss's own symbol: v4.1.0).
const reloadAll = (qc: ReturnType<typeof useQueryClient>) => Promise.all([...GEAR_PAGES, ["hexa"], ["stats"], ["stats-try"]].map((k) => qc.invalidateQueries({ queryKey: k })));

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
      // (the Stats page's score and the HEXA page's "Needs Lv." follow the level)
      void qc.invalidateQueries({ queryKey: ["stats"] });
      void qc.invalidateQueries({ queryKey: ["hexa"] });
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
    onSuccess: (saved, input) => {
      qc.setQueryData(keys.settings, saved);
      // the Black Flame price changes every cost on the Flames page, the MVP tier on the Star Force page
      // (the theme or world doesn't)
      if (input.blackFlamePrice !== undefined) void qc.invalidateQueries({ queryKey: ["flames"] });
      if (input.mvp !== undefined) void qc.invalidateQueries({ queryKey: ["starforce"] });
      // the Upgrades page uses both
      if (input.blackFlamePrice !== undefined || input.mvp !== undefined) void qc.invalidateQueries({ queryKey: ["upgrades"] });
    },
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
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: keys.symbols(world) }), reloadAll(qc)]),
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
    onSettled: () => reloadAll(qc),
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
    onSettled: () => reloadAll(qc),
  });
}

// Saving a character's stat values, the same way: what's typed (v4.1.0: what isn't is worked out).
export function useSaveStatValues(world: number) {
  const qc = useQueryClient();
  return useMutation({
    // Stryker disable next-line StringLiteral: any fixed name makes one queue
    scope: { id: "gear" },
    mutationFn: ({ id, values }: { id: number; values: StatValuesTyped }) => api<void>(`/gear/${id}/stat-values`, { method: "PUT", body: values }),
    onMutate: async ({ id, values }) => {
      await qc.cancelQueries({ queryKey: keys.gear(world) });
      qc.setQueryData<GearBoard>(keys.gear(world), (b) => b && { ...b, characters: b.characters.map((c) => (c.id === id ? { ...c, statValues: { ...c.statValues, typed: values, values: countedValues(values, c.statValues.worked) } } : c)) });
    },
    onSettled: () => reloadAll(qc),
  });
}

// The Flames page: a character's flameable items with their scores and costs (the stop scores for a
// budget), and one item's graph. A new budget keeps showing the last numbers until the new ones come
// (only for the same character).
export const useFlames = (id: number | undefined, budget: number) =>
  useQuery({ queryKey: keys.flames(id ?? 0, budget), queryFn: () => api<FlamesBoard>(`/gear/${id}/flames?budget=${budget}`), enabled: id !== undefined, placeholderData: (previous, query) => (query?.queryKey[1] === id ? previous : undefined) });
export const useFlameGraph = (id: number, slot: string) => useQuery({ queryKey: keys.flameGraph(id, slot), queryFn: () => api<FlameGraph>(`/gear/${id}/flames/${slot}`) });

// The Star Force page: a character's items that can take more stars (the stop stars for a budget), and
// one item for a target star. New settings keep showing the last numbers until the new ones come (only
// for the same character; an item's panel is made afresh for each item, so its last numbers are always
// its own).
export const useStarForce = (id: number | undefined, events: string, budget: number) =>
  useQuery({ queryKey: keys.starForce(id ?? 0, events, budget), queryFn: () => api<StarForceBoard>(`/gear/${id}/starforce?events=${events}&budget=${budget}`), enabled: id !== undefined, placeholderData: (previous, query) => (query?.queryKey[1] === id ? previous : undefined) });
export const useStarForceDetail = (id: number, slot: string, events: string, target: number) =>
  useQuery({ queryKey: keys.starForceDetail(id, slot, events, target), queryFn: () => api<StarForceDetail>(`/gear/${id}/starforce/${slot}?events=${events}&target=${target}`), placeholderData: (previous) => previous });

// The Potential page: a character's items that can have potential with what cubes would do (the stop
// scores for a budget), and one item's graph (with what reaching a target score costs, when one is
// picked; only once there's an item, which means a character too). New settings keep showing the last
// numbers until the new ones come (only for the same character, and the same item).
export const usePotential = (id: number | undefined, events: string, budget: number) =>
  useQuery({ queryKey: keys.potential(id ?? 0, events, budget), queryFn: () => api<PotentialBoard>(`/gear/${id}/potential?events=${events}&budget=${budget}`), enabled: id !== undefined, placeholderData: (previous, query) => (query?.queryKey[1] === id ? previous : undefined) });
export const usePotentialGraph = (id: number | undefined, slot: string | undefined, events: string, target: number | null) =>
  useQuery({ queryKey: keys.potentialGraph(id ?? 0, String(slot), events, target), queryFn: () => api<PotentialGraph>(`/gear/${id}/potential/${slot}?events=${events}${target === null ? "" : `&target=${target}`}`), enabled: slot !== undefined, placeholderData: (previous, query) => (query?.queryKey[1] === id && query?.queryKey[3] === slot ? previous : undefined) });

// The Upgrades page: each item's next step in each system, for the events ticked. New events keep showing
// the last numbers until the new ones come (only for the same character).
export const useUpgrades = (id: number | undefined, sf: string, cubes: string) =>
  useQuery({ queryKey: keys.upgrades(id ?? 0, sf, cubes), queryFn: () => api<UpgradesBoard>(`/gear/${id}/upgrades?sf=${sf}&cubes=${cubes}`), enabled: id !== undefined, placeholderData: (previous, query) => (query?.queryKey[1] === id ? previous : undefined) });

// The HEXA page (v3.0.0): a world's characters, and one character's HEXA worked out.
export const useHexaTabs = (world: number) => useQuery({ queryKey: keys.hexaTabs(world), queryFn: () => api<HexaTabs>(`/hexa?world=${world}`) });
// (another character's board is never shown while one loads: Loading… instead; it isn't reloaded when the
// window comes back into focus: a reload while a change is being saved would bring back the input before
// it, and only this page changes it)
export const useHexa = (id: number | undefined) => useQuery({ queryKey: keys.hexa(id ?? 0), queryFn: () => api<HexaBoard>(`/hexa/${id}`), enabled: id !== undefined, refetchOnWindowFocus: false });
// Saving a change to what's typed (the HEXA page's, the Familiars page's): made to the latest change still
// being saved (else the latest input), not the page as last drawn, so quick changes in several boxes all
// count; shown at once, saved in order, and worked out again once the last one is saved (a reload between
// them could bring back an older input).
// (`also`: other boards worked out from it, reloaded with it)
// Stryker disable next-line ArrayDeclaration: reloading a board no page has asked for changes nothing
function useSaveBoard<I, B extends { input: I }>(id: number | undefined, key: (id: number) => readonly unknown[], path: string, also: (id: number) => (readonly unknown[])[] = () => []) {
  const qc = useQueryClient();
  // the change being saved last, and whose (each save carries its character: one queued while another tab
  // is picked still goes to its own; a change on another tab is never made to it)
  const latest = useRef<{ id: number; input: I } | null>(null);
  const save = useMutation({
    scope: { id: path },
    mutationFn: (v: { id: number; input: I }) => api<void>(`/${path}/${v.id}`, { method: "PUT", body: v.input }),
    onSettled: (_data, _error, v) => {
      if (latest.current !== v) return;
      latest.current = null;
      return Promise.all([key(v.id), ...also(v.id)].map((k) => qc.invalidateQueries({ queryKey: k })));
    },
  });
  // (the page offers changes only once the board is shown: there's a character)
  const change = (f: (input: I) => I) => {
    const k = key(id!);
    const b = qc.getQueryData<B>(k)!;
    const prev = latest.current;
    const v = { id: id!, input: f(prev !== null && prev.id === id ? prev.input : b.input) };
    latest.current = v;
    // a reload under way would bring back the input from before this change
    // Stryker disable next-line ObjectLiteral: cancelling every query cancels this one too; the others the page shows (the tabs, settings) aren't reloading while it's changed
    void qc.cancelQueries({ queryKey: k });
    qc.setQueryData<B>(k, { ...b, input: v.input });
    save.mutate(v);
  };
  return { change, error: save.error };
}
// (the Stats page's score follows the HEXA levels, and so the gear pages' worked-out stat values)
export const useSaveHexa = (id: number | undefined) => useSaveBoard<HexaInput, HexaBoard>(id, keys.hexa, "hexa", (c) => [keys.stats(c), ...GEAR_PAGES]);

// The Familiars page (v3.2.0): one character's familiars and badges with their totals (its tabs: the
// character list's), saved the HEXA page's way.
export const useFamiliars = (id: number | undefined) => useQuery({ queryKey: keys.familiars(id ?? 0), queryFn: () => api<FamiliarBoard>(`/familiars/${id}`), enabled: id !== undefined, refetchOnWindowFocus: false });
export const useSaveFamiliars = (id: number | undefined) => useSaveBoard<FamiliarInput, FamiliarBoard>(id, keys.familiars, "familiars");

// The Stats page (v4.0.0): one character's Stats window and the rest, with the score and the worked-out boxes
// (its tabs: the character list's), saved the HEXA page's way.
export const useStats = (id: number | undefined) => useQuery({ queryKey: keys.stats(id ?? 0), queryFn: () => api<StatsBoard>(`/stats/${id}`), enabled: id !== undefined, refetchOnWindowFocus: false });
// (the gear pages' worked-out stat values follow the sheet: v4.1.0)
export const useSaveStats = (id: number | undefined) => useSaveBoard<StatsInput, StatsBoard>(id, keys.stats, "stats", () => [...GEAR_PAGES, ["hexa"]]);
// Test mode (v4.1.0): the page worked out for a sheet, level and HEXA levels that aren't saved. A change
// keeps showing the last numbers until the new ones come.
export const useStatsTry = (id: number | undefined, t: StatsTryInput | null) =>
  useQuery({
    // Stryker disable next-line LogicalOperator: a test only exists once a character is picked (id set), so the key's fallback is never used
    queryKey: keys.statsTry(id ?? 0, JSON.stringify(t)),
    queryFn: () => api<StatsBoard>(`/stats/${id}/try`, { method: "POST", body: t }),
    // Stryker disable next-line ConditionalExpression: as above, t is null whenever id is unset
    enabled: id !== undefined && t !== null,
    placeholderData: (previous, query) => (query?.queryKey[1] === id ? previous : undefined),
    refetchOnWindowFocus: false,
  });

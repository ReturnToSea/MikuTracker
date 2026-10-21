import type { AddCharacterInput, SettingsInput } from "@miku/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { CharacterList, CharacterView, ExpTableView, SearchResult, SettingsView, ThemeArt } from "./types";

export const keys = {
  settings: ["settings"],
  themeArt: ["theme-art"],
  expTable: ["exp-table"],
  characters: (world: number) => ["characters", world],
} as const;

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api<SettingsView>("/settings") });
export const useThemeArt = () => useQuery({ queryKey: keys.themeArt, queryFn: () => api<ThemeArt>("/theme-art") });
// The table only changes with a new version of the app, so it's loaded once per visit.
export const useExpTable = () => useQuery({ queryKey: keys.expTable, queryFn: () => api<ExpTableView>("/exp-table"), staleTime: Infinity });
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

// Changes to a world's characters reload that world's list.
function useCharacterChange<I, O>(world: number, send: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: send, onSuccess: () => qc.invalidateQueries({ queryKey: keys.characters(world) }) });
}

export const useAddCharacter = (world: number) => useCharacterChange(world, (name: string) => api<CharacterView>("/characters", { method: "POST", body: { world, name } }));
export const useSelectCharacter = (world: number) => useCharacterChange(world, (id: number) => api<void>(`/characters/${id}/select`, { method: "POST" }));
export const useDeleteCharacter = (world: number) => useCharacterChange(world, (id: number) => api<void>(`/characters/${id}`, { method: "DELETE" }));

export const useReorderCharacters = (world: number) =>
  useCharacterChange(world, (ids: number[]) => api<CharacterList>("/characters/order", { method: "PUT", body: { world, ids } }));

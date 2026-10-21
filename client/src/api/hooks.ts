import type { SettingsInput } from "@miku/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { ExpTableView, SettingsView, ThemeArt } from "./types";

export const keys = {
  settings: ["settings"],
  themeArt: ["theme-art"],
  expTable: ["exp-table"],
} as const;

export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: () => api<SettingsView>("/settings") });
export const useThemeArt = () => useQuery({ queryKey: keys.themeArt, queryFn: () => api<ThemeArt>("/theme-art") });
// The table only changes with a new version of the app, so it's loaded once per visit.
export const useExpTable = () => useQuery({ queryKey: keys.expTable, queryFn: () => api<ExpTableView>("/exp-table"), staleTime: Infinity });

// Saving settings: the saved settings come back from the server and replace the cached ones.
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => api<SettingsView>("/settings", { method: "PUT", body: input }),
    onSuccess: (saved) => qc.setQueryData(keys.settings, saved),
  });
}

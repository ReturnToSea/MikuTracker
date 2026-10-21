import { THEMES, type ThemeId } from "@miku/shared";

export const DEFAULT_THEME: ThemeId = "ren";

export const THEME_INFO: Record<ThemeId, { name: string; note: string }> = {
  ren: {
    name: "Ren",
    note: "Ren's colors: a moonlit violet night, silver-white, red eyes and gold, with an ink blossom tree and red petals drifting down.",
  },
  pochacco: {
    name: "Pochacco",
    note: "Sanrio's Pochacco on light-blue gingham, with black ink outlines, sky blue, pink and chick yellow.",
  },
};

// A theme from the server, or the default if it's one this app doesn't know.
export function knownTheme(theme: string | undefined): ThemeId {
  return THEMES.find((t) => t === theme) ?? DEFAULT_THEME;
}

// The CSS value for a theme's art, or null when it has none (the theme then draws its own).
export function artImage(url: string | null | undefined): string | null {
  return url ? `url("${url}")` : null;
}

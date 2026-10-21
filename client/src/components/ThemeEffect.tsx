import { THEMES } from "@miku/shared";
import { useEffect } from "react";
import { useSettings, useThemeArt } from "../api/hooks";
import { artImage, knownTheme } from "../lib/themes";
import { RenSky } from "../looks/RenSky";

// Applies the saved theme to the whole page. Each theme's art (when the data folder has some)
// gets its own variable, --art-<theme>, whichever theme is in use, so the theme cards on the
// Themes tab each preview their own. Ren without art gets its drawn background instead.
export function ThemeEffect() {
  const theme = knownTheme(useSettings().data?.theme);
  const art = useThemeArt().data;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    for (const t of THEMES) document.documentElement.style.setProperty(`--art-${t}`, artImage(art?.[t])); // null removes it
  }, [art]);

  return theme === "ren" && !art?.ren ? <RenSky /> : null;
}

import { THEMES } from "@miku/shared";
import { useSettings, useUpdateSettings } from "../api/hooks";
import { knownTheme, THEME_INFO } from "../lib/themes";

// The bars in each card's little preview chart.
const PREVIEW_BARS = [30, 26, 34, 40, 46, 58, 40, 96, 30];

export function ThemesPage() {
  const current = knownTheme(useSettings().data?.theme);
  const save = useUpdateSettings();
  return (
    <>
      <section className="block">
        <h1 className="page-title">Themes</h1>
        <p className="muted">Pick how MikuTracker looks. Each card shows its own colors.</p>
        {save.isError && <p className="error" role="alert">Couldn't save the theme: {save.error.message}</p>}
      </section>
      <div className="theme-grid">
        {THEMES.map((id) => (
          <button
            key={id}
            type="button"
            className="theme-card"
            data-theme={id}
            aria-pressed={id === current}
            disabled={save.isPending}
            onClick={() => save.mutate({ theme: id })}
          >
            <div className="mini" aria-hidden="true">
              {PREVIEW_BARS.map((height, i) => (
                <span key={i} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="mini-exp" aria-hidden="true" />
            <div className="name">
              {THEME_INFO[id].name}
              {id === current && <small>In use</small>}
            </div>
            <p>{THEME_INFO[id].note}</p>
          </button>
        ))}
      </div>
    </>
  );
}

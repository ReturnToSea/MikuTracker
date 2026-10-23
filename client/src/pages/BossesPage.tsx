import { worldName } from "@miku/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { keys, useBossBoard, useRefreshStatus, useSaveBossPlan, useSetBossCleared, useSettings, useUpdateSettings } from "../api/hooks";
import { BossCard } from "../components/BossCard";
import { BossPlanner } from "../components/BossPlanner";
import { WorldSwitcher } from "../components/WorldSwitcher";
import { resetDay, resetLocal, untilReset } from "../lib/bosses";
import { fmtExp } from "../lib/format";

// The time now, every second; when a reset passes, the board is loaded again (its ticks clear),
// once for that reset (if this computer's clock is ahead of the server's, the answer can still
// have the old week for a moment, and that's not asked about again every second).
function useClock(world: number, resets: Date[]) {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const next = Math.min(...resets.map((r) => r.getTime()));
  const asked = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => {
      const t = new Date();
      if (t.getTime() >= next && asked.current !== next) {
        asked.current = next;
        void qc.invalidateQueries({ queryKey: keys.bosses(world) });
      }
      setNow(t);
    }, 1000);
    return () => clearInterval(timer);
  }, [next, world, qc]);
  return now;
}

// The Bosses tab: each character's planned bosses this week, ticked off as they're cleared.
export function BossesPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const board = useBossBoard(world);
  const savePlan = useSaveBossPlan(world);
  const setCleared = useSetBossCleared(world);
  const [planning, setPlanning] = useState<number | null>(null);
  useRefreshStatus(); // after each check of Nexon, the cards' levels, jobs and avatars load again

  const b = board.data;
  const weekly = b ? new Date(b.week.resetsAt) : null;
  const monthly = b ? new Date(b.month.resetsAt) : null;
  const now = useClock(world, weekly && monthly ? [weekly, monthly] : []);
  const planned = b?.characters.find((c) => c.id === planning);
  const t = b?.totals;

  return (
    <>
      <h1 className="visually-hidden">Bosses</h1>
      <section className="block">
        <div className="page-head">
          <div className="tools-inline">
            <WorldSwitcher world={world} onChange={(w) => saveSettings.mutate({ worldId: w })} />
            {weekly && (
              <span className="muted small countdown">
                Weekly reset in <b>{untilReset(now, weekly)}</b> · {resetLocal(weekly)} your time
              </span>
            )}
          </div>
          {b && <span className="muted small">Prices: GMS Heroic, as of {b.pricesPatch}</span>}
        </div>
        {b && t && monthly && (
          <div className="stats boss-stats">
            <div className="stat">
              <div className="label">This week so far</div>
              <div className="value">{fmtExp(t.soFar)}</div>
              <div className="muted small">of {fmtExp(t.planned)} planned</div>
            </div>
            <div className="stat">
              <div className="label">Bosses cleared</div>
              <div className="value">
                {t.cleared} / {t.bosses}
              </div>
              <div className="boss-progress">
                <div style={{ width: `${t.bosses ? (t.cleared / t.bosses) * 100 : 0}%` }} />
              </div>
            </div>
            <div className="stat">
              <div className="label">Crystals (world limit {b.limits.perWorld})</div>
              <div className="value">{t.crystals}</div>
              <div className={`small ${t.crystals > b.limits.perWorld ? "warning" : "muted"}`}>
                {t.crystals > b.limits.perWorld ? `${t.crystals - b.limits.perWorld} over: the least valuable don't count` : "within the limit"}
              </div>
            </div>
            <div className="stat">
              <div className="label">Monthly · Black Mage</div>
              <div className="value">{fmtExp(t.monthlySoFar)}</div>
              <div className="muted small">
                of {fmtExp(t.monthlyPlanned)} · resets {resetDay(monthly)}
              </div>
            </div>
          </div>
        )}
      </section>
      {setCleared.isError && (
        <p className="error block" role="alert">
          {setCleared.error.message}
        </p>
      )}
      {board.isError && (
        <p className="error block" role="alert">
          Couldn't load the bosses: {board.error.message}
        </p>
      )}
      {board.isPending && <p className="notice muted block">Loading…</p>}
      {b?.characters.length === 0 && (
        <section className="block">
          <p className="notice muted">No characters on {worldName(world)} yet. Add them on Home first.</p>
        </section>
      )}
      {b && b.characters.length > 0 && monthly && (
        <>
          <div className="boss-strip" aria-label="Characters">
            {b.characters.map((c) => (
              <BossCard
                key={c.id}
                c={c}
                bosses={b.bosses}
                limits={b.limits}
                monthlyReset={resetDay(monthly)}
                onPlan={() => setPlanning(c.id)}
                onTick={(boss, cleared) => setCleared.mutate({ id: c.id, boss, cleared })}
              />
            ))}
          </div>
          {b.characters.length > 2 && <p className="muted small boss-strip-note">{b.characters.length} characters · scroll sideways for more →</p>}
        </>
      )}
      {b && planned && (
        <BossPlanner
          c={planned}
          bosses={b.bosses}
          perCharacter={b.limits.perCharacter}
          saving={savePlan.isPending}
          error={savePlan.error?.message ?? null}
          onSave={(plan) => savePlan.mutate({ id: planned.id, plan }, { onSuccess: () => setPlanning(null) })}
          onClose={() => {
            savePlan.reset(); // a failed save's message belongs to that visit of the menu
            setPlanning(null);
          }}
        />
      )}
    </>
  );
}

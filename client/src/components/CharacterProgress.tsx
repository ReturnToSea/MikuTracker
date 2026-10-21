import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { keys, useProgress } from "../api/hooks";
import type { DayBar, LevelGoal } from "../api/types";
import { barDetail, barLabel, dayLabel, niceMax, ticks } from "../lib/chart";
import { nextUtcMidnight, untilNextUtcDay, utcDay } from "../lib/countdown";
import { fmtDuration, fmtExp, fmtFutureDate } from "../lib/format";

// Below the selected character: EXP per UTC day for the last 14 finished days, its stats, and the
// time to the next level and the next multiple of 5.
export function CharacterProgress({ id }: { id: number }) {
  const progress = useProgress(id);
  if (progress.isPending) return <p className="notice muted block">Loading…</p>;
  if (progress.isError) {
    return (
      <p className="error block" role="alert">
        Couldn't load the EXP history: {progress.error.message}
      </p>
    );
  }
  const { bars, stats, goals } = progress.data;
  return (
    <>
      <section className="block" aria-label="EXP">
        <div className="stats exp-stats">
          <Stat label="EXP last 7 days" value={stats.last7 === null ? "—" : fmtExp(stats.last7)} />
          <Stat label="Daily average (14 days)" value={stats.average === null ? "—" : fmtExp(stats.average)} />
          <Stat label="Best day" value={stats.best ? fmtExp(stats.best.gained) : "—"} note={stats.best ? dayLabel(stats.best.day) : undefined} />
        </div>
        <div className="chart-head">
          <h3>
            EXP farmed per day (UTC)
            {stats.average !== null && (
              <span className="legend">
                <i aria-hidden="true" />
                14-day average <b>{fmtExp(stats.average)}</b>
              </span>
            )}
          </h3>
          <Countdown id={id} />
        </div>
        <DailyChart bars={bars} average={stats.average} />
        <p className="chart-foot muted small">Each bar is one finished UTC day. Nexon is checked every 4 hours; days that weren't checked show as "no data", and their EXP lands on the next day that was.</p>
      </section>
      <TimeToLevel goals={goals} average={stats.average} />
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {note && <div className="muted small">{note}</div>}
    </div>
  );
}

// "New day in 20h 49m 05s · 00:00 UTC is 5:00 PM your time". When the UTC day changes, the chart
// moves on a day (yesterday's bar is finished).
function Countdown({ id }: { id: number }) {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  // Stryker disable ArrayDeclaration: the whole section is rebuilt for each character (its key), so id and qc never change within one countdown
  useEffect(() => {
    const timer = setInterval(() => {
      const next = new Date();
      setNow((before) => {
        if (utcDay(next) !== utcDay(before)) void qc.invalidateQueries({ queryKey: keys.progress(id) });
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [id, qc]);
  // Stryker restore ArrayDeclaration
  const local = nextUtcMidnight(now).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <span className="countdown muted small">
      New day in <b>{untilNextUtcDay(now)}</b> · 00:00 UTC is {local} your time
    </span>
  );
}

function DailyChart({ bars, average }: { bars: DayBar[]; average: number | null }) {
  const max = niceMax(Math.max(0, ...bars.map((b) => b.gained ?? 0)));
  const pct = (v: number) => `${(v / max) * 100}%`;
  const empty = bars.every((b) => b.gained === null);
  return (
    <div className="chart" role="group" aria-label="EXP per day">
      <div className="yaxis" aria-hidden="true">
        {!empty &&
          ticks(max).map((t) => (
            <span key={t} style={{ bottom: pct(t) }}>
              {fmtExp(t)}
            </span>
          ))}
      </div>
      <div className="plot">
        {ticks(max)
          .slice(1)
          .map((t) => (
            <div key={t} className="grid-line" style={{ bottom: pct(t) }} />
          ))}
        {average !== null && <div className="avg-line" data-testid="average-line" style={{ bottom: pct(average) }} />}
        {empty && <p className="chart-empty muted">No EXP history yet: the first bar appears once a full UTC day has been checked.</p>}
        <div className="bars">
          {bars.map((bar) => (
            <div key={bar.day} className={`bar-col${bar.gained === null ? " no-data" : ""}`} tabIndex={0} title={barDetail(bar)} aria-label={barDetail(bar)}>
              <span className="bar-label" style={{ bottom: `calc(${pct(bar.gained ?? 0)} + 4px)` }}>
                {barLabel(bar)}
                {bar.covers > 1 && <small>{bar.covers} days</small>}
              </span>
              <div className="bar" style={{ height: pct(bar.gained ?? 0) }} />
            </div>
          ))}
        </div>
      </div>
      <div className="xaxis" aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar.day}>{dayLabel(bar.day)}</span>
        ))}
      </div>
    </div>
  );
}

const GOAL_LABEL: Record<LevelGoal["kind"], string> = { "next-level": "Next level", "next-multiple-of-5": "Next multiple of 5" };

function TimeToLevel({ goals, average }: { goals: LevelGoal[]; average: number | null }) {
  return (
    <section className="block" aria-label="Time to level">
      <div className="chart-head">
        <h3>Time to level</h3>
        {average !== null && (
          <span className="countdown muted small">
            At the 14-day average of <b>{fmtExp(average)}</b> a day
          </span>
        )}
      </div>
      {goals.length === 0 ? (
        <p className="muted">Level 300: nothing left to reach.</p>
      ) : (
        <div className="eta">
          {goals.map((g) => (
            <div key={g.kind} className="eta-item">
              <div className="label muted small">{GOAL_LABEL[g.kind]}</div>
              <div className="eta-level">Level {g.target}</div>
              <div className="value">{average === null ? "Not enough history yet" : g.days === null ? "Not at this pace" : fmtDuration(g.days)}</div>
              <small className="muted">
                {fmtExp(g.remaining)} EXP to go
                {average === null ? " · needs a full UTC day of history" : g.days === null ? " · no EXP in the last 14 days" : ` · around ${fmtFutureDate(g.days, new Date())}`}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

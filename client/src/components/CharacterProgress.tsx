import { MAX_LEVEL } from "@miku/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { keys, useProgress } from "../api/hooks";
import type { DayBar, LevelGoal, LevelPoint, ProgressView } from "../api/types";
import { amountStyle, barDetail, barLabel, dayLabel, fmtLevelPct, niceMax, showDate, ticks } from "../lib/chart";
import { nextUtcMidnight, untilNextUtcDay, utcDay } from "../lib/countdown";
import { levelDetail, levelHeight, levelScale, tickLabel } from "../lib/levelChart";
import { fmtDuration, fmtExp, fmtFutureDate } from "../lib/format";

type Range = ProgressView["ranges"][number];

// Below the selected character: EXP per UTC day for the last 7, 14, 30 or 90 days (today
// included), each range's daily average, share of a level a day and total, and the time to the
// next level and the next multiple of 5 at the chosen range's average.
export function CharacterProgress({ id }: { id: number }) {
  const progress = useProgress(id);
  const [days, setDays] = useState(14);
  const [view, setView] = useState<"exp" | "level">("exp");
  if (progress.isPending) return <p className="notice muted block">Loading…</p>;
  if (progress.isError) {
    return (
      <p className="error block" role="alert">
        Couldn't load the EXP history: {progress.error.message}
      </p>
    );
  }
  const { today, bars, levels, ranges } = progress.data;
  const range = ranges.find((r) => r.days === days)!;
  const average = range.stats?.average ?? null;
  return (
    <>
      <section className="block" aria-label="EXP">
        <div className="range-boxes">
          {ranges.map((r) => (
            <RangeBox key={r.days} range={r} selected={r.days === days} onSelect={() => setDays(r.days)} />
          ))}
        </div>
        <div className="chart-head">
          <div className="segmented chart-view" role="group" aria-label="Chart">
            <button type="button" aria-pressed={view === "exp"} onClick={() => setView("exp")}>
              EXP per day
            </button>
            <button type="button" aria-pressed={view === "level"} onClick={() => setView("level")}>
              Level
            </button>
          </div>
          <h3 className="chart-title">
            {view === "exp" ? "EXP farmed per day (UTC)" : "Level per day (UTC)"}
            {view === "exp" && average !== null && (
              <span className="legend">
                <i aria-hidden="true" />
                {days}-day average <b>{fmtExp(average)}</b>
              </span>
            )}
          </h3>
          <div className="segmented" role="group" aria-label="Days shown">
            {ranges.map((r) => (
              <button key={r.days} type="button" aria-pressed={r.days === days} onClick={() => setDays(r.days)}>
                {r.days} days
              </button>
            ))}
          </div>
        </div>
        {view === "exp" ? <DailyChart bars={bars.slice(-days)} average={average} today={today} /> : <LevelChart days={bars.slice(-days).map((b) => b.day)} levels={levels} today={today} />}
        <p className="chart-foot muted small">
          <Countdown id={id} />{" "}
          {view === "exp"
            ? `Each bar is one UTC day; today's grows with each check of Nexon (every 4 hours). Days that weren't checked show as "no data", and their EXP lands on the next day that was.`
            : "Level on each checked UTC day, with progress through the level. Highlighted dots: level-ups (a level-up on a day that wasn't checked shows on the next day that was)."}
        </p>
      </section>
      <TimeToLevel range={range} />
    </>
  );
}

function RangeBox({ range, selected, onSelect }: { range: Range; selected: boolean; onSelect: () => void }) {
  const s = range.stats;
  return (
    <button type="button" className={`range-box${selected ? " on" : ""}`} aria-pressed={selected} onClick={onSelect}>
      <span className="range-name">{range.days} days</span>
      <span className="range-avg">
        {s ? fmtExp(s.average) : "—"} <small>a day</small>
      </span>
      <span className="range-sub">
        <span>
          Gained <b className={s && s.levelPerDay > 0 ? "gain" : undefined}>{s ? `${fmtLevelPct(s.levelPerDay)} a day` : "—"}</b>
        </span>
        <span>
          Total <b>{s ? fmtExp(s.total) : "—"}</b>
        </span>
      </span>
    </button>
  );
}

// "New day in 20h 49m 05s · 00:00 UTC is 5:00 PM your time". When the UTC day changes, the chart
// moves on a day (a new bar for the new day).
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
    <span className="countdown">
      New day in <b>{untilNextUtcDay(now)}</b> · 00:00 UTC is {local} your time.
    </span>
  );
}

function DailyChart({ bars, average, today }: { bars: DayBar[]; average: number | null; today: string }) {
  const highest = Math.max(0, ...bars.map((b) => b.gained ?? 0));
  const max = niceMax(highest);
  const pct = (v: number) => `${(Math.max(0, v) / max) * 100}%`;
  const empty = bars.every((b) => b.gained === null);
  const amounts = amountStyle(bars.length);
  return (
    <div className={`chart amounts-${amounts}`} role="group" aria-label="EXP per day">
      <div className="yaxis" aria-hidden="true">
        {highest > 0 &&
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
        {empty && <p className="chart-empty muted">No EXP history yet: the first bar appears after the next check of Nexon (every 4 hours).</p>}
        <div className="bars">
          {bars.map((bar) => (
            <div key={bar.day} className={`bar-col${bar.gained === null ? " no-data" : ""}`} tabIndex={0} title={barDetail(bar, today)} aria-label={barDetail(bar, today)}>
              {amounts !== "none" && (
                <span className="bar-label" style={{ bottom: `calc(${pct(bar.gained ?? 0)} + 4px)` }}>
                  {barLabel(bar)}
                  {amounts === "full" && bar.covers > 1 && <small>{bar.covers} days</small>}
                </span>
              )}
              <div className="bar" style={{ height: pct(bar.gained ?? 0) }} />
            </div>
          ))}
        </div>
      </div>
      <div className="xaxis" aria-hidden="true">
        {bars.map((bar, i) => (
          <span key={bar.day}>{showDate(i, bars.length) ? (bar.day === today ? "Today" : dayLabel(bar.day)) : ""}</span>
        ))}
      </div>
    </div>
  );
}

// Level over the shown days: a line through each checked day's level (with progress through it),
// highlighted dots at level-ups, the latest day in white, and up to 14 days a small dot on every checked
// day (beyond that they crowd the line). Same days and dates as the EXP chart.
function LevelChart({ days, levels, today }: { days: string[]; levels: LevelPoint[]; today: string }) {
  const shown = levels.filter((p) => p.day >= days[0]!);
  const scale = levelScale(shown.map((p) => p.level));
  const at = new Map(shown.map((p) => [p.day, p]));
  const x = (day: string) => ((days.indexOf(day) + 0.5) / days.length) * 100;
  const y = (level: number) => (scale ? levelHeight(level, scale) * 100 : 0);
  const line = shown.map((p) => `${x(p.day)},${100 - y(p.level)}`).join(" ");
  const latest = shown.at(-1);
  const dotted = shown.filter((p) => days.length <= 14 || p.reached.length > 0 || p === latest);
  return (
    <div className="chart level-chart" role="group" aria-label="Level per day">
      <div className="yaxis" aria-hidden="true">
        {scale?.ticks.map((t) => (
          <span key={t} style={{ bottom: `${y(t)}%` }}>
            {tickLabel(t)}
          </span>
        ))}
      </div>
      <div className="plot">
        {scale?.ticks.map((t) => (
          <div key={t} className="grid-line" style={{ bottom: `${y(t)}%` }} />
        ))}
        {/* The line and dots share the day columns' box (no gaps between columns here), so each
            point sits exactly over its column and its date. */}
        <div className="level-area">
        {scale && (
          <svg className="level-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polygon points={`${x(shown[0]!.day)},100 ${line} ${x(shown.at(-1)!.day)},100`} />
            <polyline points={line} />
          </svg>
        )}
        {dotted.map((p) => (
          <span
            key={p.day}
            className={`level-dot${p.reached.length ? " up" : ""}${p === latest ? " latest" : ""}`}
            style={{ left: `${x(p.day)}%`, bottom: `${y(p.level)}%` }}
            aria-hidden="true"
          />
        ))}
        </div>
        {!scale && <p className="chart-empty muted">No level history yet: the first point appears after the next check of Nexon (every 4 hours).</p>}
        <div className="bars">
          {days.map((day) => (
            <div key={day} className={`level-col${at.has(day) ? "" : " no-data"}`} tabIndex={0} title={levelDetail(day, at.get(day), today)} aria-label={levelDetail(day, at.get(day), today)} />
          ))}
        </div>
      </div>
      <div className="xaxis" aria-hidden="true">
        {days.map((day, i) => (
          <span key={day}>{showDate(i, days.length) ? (day === today ? "Today" : dayLabel(day)) : ""}</span>
        ))}
      </div>
    </div>
  );
}

const GOAL_LABEL: Record<LevelGoal["kind"], string> = { "next-level": "Next level", "next-multiple-of-5": "Next multiple of 5" };

function TimeToLevel({ range }: { range: Range }) {
  const average = range.stats?.average ?? null;
  return (
    <section className="block" aria-label="Time to level">
      <div className="chart-head">
        <h3>Time to level</h3>
        {average !== null && (
          <span className="countdown muted small">
            At the {range.days}-day average of <b>{fmtExp(Math.max(0, average))}</b> a day
          </span>
        )}
      </div>
      {range.goals.length === 0 ? (
        <p className="muted">Level {MAX_LEVEL}: nothing left to reach.</p>
      ) : (
        <div className="eta">
          {range.goals.map((g) => (
            <div key={g.kind} className="eta-item">
              <div className="label muted small">{GOAL_LABEL[g.kind]}</div>
              <div className="eta-level">Level {g.target}</div>
              <div className="value">{average === null ? "Not enough history yet" : g.days === null ? "Not at this pace" : fmtDuration(g.days)}</div>
              <small className="muted">
                {fmtExp(g.remaining)} EXP to go
                {average === null ? ` · no EXP history in the last ${range.days} days` : g.days === null ? ` · no EXP in the last ${range.days} days` : ` · around ${fmtFutureDate(g.days, new Date())}`}
              </small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

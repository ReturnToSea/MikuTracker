import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { keys, useProgress } from "../api/hooks";
import type { DayBar, LevelGoal, ProgressView } from "../api/types";
import { amountStyle, barDetail, barLabel, dayLabel, fmtLevelPct, niceMax, showDate, ticks } from "../lib/chart";
import { nextUtcMidnight, untilNextUtcDay, utcDay } from "../lib/countdown";
import { fmtDuration, fmtExp, fmtFutureDate } from "../lib/format";

type Range = ProgressView["ranges"][number];

// Below the selected character: EXP per UTC day for the last 7, 14, 30 or 90 days (today
// included), each range's daily average, share of a level a day and total, and the time to the
// next level and the next multiple of 5 at the chosen range's average.
export function CharacterProgress({ id }: { id: number }) {
  const progress = useProgress(id);
  const [days, setDays] = useState(14);
  if (progress.isPending) return <p className="notice muted block">Loading…</p>;
  if (progress.isError) {
    return (
      <p className="error block" role="alert">
        Couldn't load the EXP history: {progress.error.message}
      </p>
    );
  }
  const { today, bars, ranges } = progress.data;
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
          <h3>
            EXP farmed per day (UTC)
            {average !== null && (
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
        <DailyChart bars={bars.slice(-days)} average={average} today={today} />
        <p className="chart-foot muted small">
          <Countdown id={id} /> Each bar is one UTC day; today's grows with each check of Nexon (every 4 hours). Days that weren't checked show as "no data", and their EXP lands on the next day that was.
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
        <p className="muted">Level 300: nothing left to reach.</p>
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

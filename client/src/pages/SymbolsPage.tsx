import { worldName } from "@miku/shared";
import { useEffect, useState } from "react";
import { useRefreshStatus, useSaveSymbol, useSettings, useSymbols, useUpdateSettings } from "../api/hooks";
import type { SymbolInfo } from "../api/types";
import { Avatar } from "../components/Avatar";
import { WorldSwitcher } from "../components/WorldSwitcher";
import { fmtDuration, fmtExp, fmtFutureDate } from "../lib/format";
import { allMaxedWith, blankState, daysToMax, fit, forecast, mesoToMax, mostForce, need, soonest, summary, type SymbolState } from "../lib/symbols";

type Kind = SymbolInfo["kind"];

// A whole-number box that keeps what's typed and saves it when you leave it or press Enter (so
// typing "19" doesn't save a 1 on the way). It then shows what was actually kept (onCommit says
// what that is: a value past what the symbol allows is fitted).
function NumberBox({ value, label, onCommit, width = 54 }: { value: number; label: string; onCommit: (n: number) => number; width?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  // An empty box is put back, not saved as 0.
  const commit = () => {
    const n = Math.floor(Number(text));
    setText(String(text.trim() !== "" && Number.isFinite(n) && n !== value ? onCommit(n) : value));
  };
  return (
    <input
      type="number"
      className="text-input count"
      style={{ width }}
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

const MAX_DAYS = 730; // the forecast's length: two years

const when = (days: number | null, now: Date) => (days === null ? "never" : days === 0 ? "maxed" : `${fmtDuration(days)} · ${fmtFutureDate(days, now)}`);
const short = (days: number | null) => (days === null ? "—" : days === 0 ? "maxed" : fmtDuration(days).replace("≈ ", ""));

// The Force forecast: the tab's Force from today until everything is maxed, with the top as a
// dashed line.
function ForceGraph({ points, max, now, days }: { points: { day: number; force: number }[]; max: number; now: Date; days: number }) {
  if (points.length === 1) return <p className="muted small">Nothing is levelling up: everything unlocked is maxed, or no symbols are coming in.</p>;
  const cut = points.at(-1)!.day === days && points.at(-1)!.force < max;
  const w = 1000;
  const h = 200;
  const last = Math.max(1, points.at(-1)!.day);
  const low = Math.min(points[0]!.force, max) * 0.9;
  const x = (d: number) => 50 + (d / last) * (w - 70);
  const y = (f: number) => h - 26 - ((f - low) / (max - low || 1)) * (h - 50);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.force).toFixed(1)}`).join("");
  // Up to five dates along the bottom, each once; the last one ends at the right edge.
  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(last * p)))];
  return (
    <>
    {cut && <p className="muted small">The graph shows the first two years; maxing everything takes longer.</p>}
    <svg className="force-graph" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Force from ${points[0]!.force} now to ${points.at(-1)!.force} on day ${points.at(-1)!.day}`}>
      <line x1={50} x2={w - 20} y1={y(max)} y2={y(max)} className="graph-max" />
      <text x={w - 20} y={y(max) - 6} textAnchor="end" className="graph-label">
        max {max}
      </text>
      <path d={path} className="graph-line" />
      <text x={44} y={y(points[0]!.force) + 4} textAnchor="end" className="graph-label">
        {points[0]!.force}
      </text>
      {ticks.map((t, i) => (
        <text key={i} x={x(t)} y={h - 6} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} className="graph-label">
          {t === 0 ? "today" : fmtFutureDate(t, now)}
        </text>
      ))}
    </svg>
    </>
  );
}

// The symbol calculator: one character at a time, Arcane or Sacred. What's entered is saved as
// typed; times, meso, coupons and the forecast follow it live.
export function SymbolsPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const board = useSymbols(world);
  const save = useSaveSymbol(world);
  useRefreshStatus();
  const [picked, setPicked] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>("arcane");
  const [coupons, setCoupons] = useState({ arcane: "0", sacred: "0" });
  const now = new Date();

  const b = board.data;
  const c = b?.characters.find((x) => x.id === picked) ?? b?.characters[0];
  const symbols = b ? b.symbols.filter((s) => s.kind === kind) : [];
  // What was saved, fitted to the current game figures (a later patch could lower a top level).
  const states: Record<string, SymbolState> = Object.fromEntries(symbols.map((s) => [s.id, fit(s, c?.symbols[s.id] ?? blankState())]));
  // Saves a change (fitted to the symbol), unless it comes to what's already there; returns what's kept.
  const set = (s: SymbolInfo, change: Partial<SymbolState>) => {
    const next = fit(s, { ...states[s.id]!, ...change });
    const same = (Object.keys(next) as (keyof SymbolState)[]).every((k) => next[k] === states[s.id]![k]);
    if (c && !same) save.mutate({ id: c.id, symbol: s.id, state: next });
    return next;
  };
  const sum = summary(symbols, states);
  const n = Math.max(0, Math.floor(Number(coupons[kind]) || 0));
  const fast = soonest(symbols, states, kind, n);
  const force = mostForce(symbols, states, kind, n);
  const name = (id: string) => symbols.find((s) => s.id === id)!.name;
  const giveList = (give: Record<string, number>) =>
    Object.keys(give).length === 0 ? (
      <span className="muted small">Nothing to put in.</span>
    ) : (
      Object.entries(give).map(([id, k]) => (
        <div key={id} className="limit-row small">
          <span>{name(id)}</span>
          <b>{k}</b>
        </div>
      ))
    );

  return (
    <>
      <h1 className="visually-hidden">Symbols</h1>
      <section className="block top">
        <div className="page-head">
          <WorldSwitcher world={world} onChange={(w) => { save.reset(); saveSettings.mutate({ worldId: w }); }} />
        </div>
        {b && b.characters.length > 0 && (
          <div className="strip" role="tablist" aria-label="Characters">
            {b.characters.map((x) => (
              <button key={x.id} type="button" role="tab" className="ctab" aria-selected={x.id === c?.id} onClick={() => { save.reset(); setPicked(x.id); }}>
                <Avatar src={x.avatar} size={36} name={x.name} />
                <span>
                  <b>{x.name}</b>
                  <small>
                    Lv. {x.level} · {x.job}
                  </small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      {save.isError && (
        <p className="error block" role="alert">
          {save.error.message}
        </p>
      )}
      {board.isError && (
        <p className="error block" role="alert">
          Couldn't load the symbols: {board.error.message}
        </p>
      )}
      {board.isPending && <p className="notice muted block">Loading…</p>}
      {b?.characters.length === 0 && (
        <section className="block">
          <p className="notice muted">No characters on {worldName(world)} yet. Add them on Home first.</p>
        </section>
      )}
      {b && c && (
        <>
          <div className="symbols">
            <section className="block" aria-label="Symbols">
              <div className="section-head">
                <div className="segmented" role="group" aria-label="Symbol kind">
                  {(["arcane", "sacred"] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={k === kind} onClick={() => setKind(k)}>
                      {k === "arcane" ? "Arcane" : "Sacred"}
                    </button>
                  ))}
                </div>
                <span className="muted small">Level · symbols held · days a week · weekly clears</span>
              </div>
              <div className="symbol-grid">
                {symbols.map((s) => {
                  const st = states[s.id]!;
                  const top = st.level >= s.maxLevel;
                  return (
                    <div key={s.id} className={`symbol-card${top ? " maxed" : st.level === 0 ? " locked" : ""}`} role="group" aria-label={s.name}>
                      <div className="symbol-top">
                        <b>{s.name}</b>
                        {s.grand && <span className="cust">Grand</span>}
                        {s.selector === null && <span className="tiny muted">no selector</span>}
                        <span className="muted small symbol-force">Force {s.force[st.level]}</span>
                      </div>
                      <div className="symbol-fields">
                        <label>
                          Lv <NumberBox value={st.level} label={`${s.name} level`} onCommit={(level) => set(s, { level }).level} />
                        </label>
                        {st.level === 0 ? (
                          <span className="muted small">not unlocked</span>
                        ) : top ? (
                          <span className="muted small">max</span>
                        ) : (
                          <label>
                            <NumberBox value={st.held} label={`${s.name} symbols held`} width={70} onCommit={(held) => set(s, { held }).held} /> / {need(s, st.level)}
                          </label>
                        )}
                      </div>
                      {st.level > 0 && !top && (
                        <div className="boss-progress">
                          <div style={{ width: `${(st.held / need(s, st.level)) * 100}%` }} />
                        </div>
                      )}
                      <div className="symbol-fields">
                        <label>
                          Daily{" "}
                          <select aria-label={`${s.name} days a week`} value={st.days} onChange={(e) => set(s, { days: Number(e.target.value) })}>
                            {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>{" "}
                          days/wk
                        </label>
                        {s.weeklyPerClear !== null && (
                          <label>
                            Weekly{" "}
                            <select aria-label={`${s.name} weekly clears`} value={st.weekly} onChange={(e) => set(s, { weekly: Number(e.target.value) })}>
                              {[0, 1, 2, 3].map((d) => (
                                <option key={d}>{d}</option>
                              ))}
                            </select>{" "}
                            clears
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="symbols-side">
              <section className="block" aria-label="Time to max">
                <div className="section-head">
                  <div>
                    <div className="muted small">{kind === "arcane" ? "Arcane" : "Sacred"} Force</div>
                    <div className="value-big">
                      {sum.force} <span className="muted small">/ {sum.maxForce}</span>
                    </div>
                  </div>
                  <div className="right">
                    <div className="muted small">All maxed</div>
                    <div className="value-big">{short(sum.allMaxed)}</div>
                    <div className="tiny muted">
                      {sum.allMaxed ? fmtFutureDate(sum.allMaxed, now) + " · " : ""}
                      {fmtExp(sum.meso)} meso to go
                    </div>
                  </div>
                </div>
                <div className="ttm">
                  {symbols.map((s) => {
                    const st = states[s.id]!;
                    const d = daysToMax(s, st);
                    return (
                      <div key={s.id} className="ttm-row small">
                        <span>{s.name}</span>
                        <b className={d === 0 ? "gold" : ""}>{st.level === 0 ? "—" : short(d)}</b>
                        <span className="muted tiny">{st.level === 0 || d === 0 ? "" : `${d === null ? "set days" : fmtFutureDate(d, now)} · ${fmtExp(mesoToMax(s, st.level)!)}`}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="tiny muted">Not unlocked symbols (Lv 0) aren't counted. Costs and symbols a day as of {b.patch}.</p>
              </section>
              <section className="block coupons" aria-label="Selector coupons">
                <div className="section-head">
                  <h2 className="small">{kind === "arcane" ? "Arcane" : "Sacred"} Symbol Selector Coupons</h2>
                  <label className="small muted">
                    I have <input type="number" className="text-input count" style={{ width: 80 }} min={0} aria-label="Selector coupons" value={coupons[kind]} onChange={(e) => setCoupons({ ...coupons, [kind]: e.target.value })} />
                  </label>
                </div>
                <div className="advice">
                  <div>
                    <b className="small">Everything maxed soonest</b>
                    {giveList(fast)}
                    <span className="tiny muted">Then all maxed: {sum.unlocked ? when(allMaxedWith(symbols, states, fast), now) : "—"}</span>
                  </div>
                  <div>
                    <b className="small">Most Force soonest</b>
                    {giveList(force.give)}
                    <span className="tiny muted">+{force.gain} Force right away</span>
                  </div>
                </div>
                {kind === "sacred" && <p className="tiny muted">Sacred selectors cover the 6 Sacred symbols and Tallahart (since v.271); Geardock has none.</p>}
              </section>
            </div>
          </div>
          <section className="block" aria-label="Force forecast">
            <div className="section-head">
              <h2>{kind === "arcane" ? "Arcane" : "Sacred"} Force forecast</h2>
              <span className="muted small">at the days a week above</span>
            </div>
            <ForceGraph points={forecast(symbols, states)} max={sum.maxForce} now={now} days={MAX_DAYS} />
          </section>
        </>
      )}
    </>
  );
}

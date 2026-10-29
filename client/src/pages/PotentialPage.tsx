import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CUBE_EVENTS, POTENTIAL_RANKS } from "@miku/shared";
import { useGear, usePotential, usePotentialGraph, useRefreshStatus, useSaveGearDetails, useSaveStatValues, useSettings, useUpdateSettings } from "../api/hooks";
import type { Cube, PotentialBoard, PotentialItem } from "../api/types";
import { CHART_MODES, type ChartMode, FlameChart } from "../components/FlameChart";
import { StatValuesBox } from "../components/GearDetails";
import { BudgetBox, GearTop, ItemIcon, NoCharacters, useGearCharacter } from "../components/GearTop";
import { DEFAULT_BUDGET, formatMeso, formatScore } from "../lib/flames";
import { rankName } from "../lib/gearDetails";
import { changed, cooldownText, CUBE_EVENT_LABELS, type CubeEvent, cubeEventsParam, cubePrice, fineChance, lineText, liveScore, oneIn, type Potential, signedScore, withPotential, withRank } from "../lib/potential";
import { eventsFrom, pageQuery } from "../lib/upgrades";

type Rank = (typeof POTENTIAL_RANKS)[number];
const CUBE_NAMES: Record<Cube, string> = { glowing: "Glowing", bright: "Bright" };
const CUBES: Cube[] = ["glowing", "bright"];
const Chip = ({ cube }: { cube: Cube }) => <span className="cube-chip">{CUBE_NAMES[cube]}</span>;
const fd = (score: number, fdPer100: number) => `${((score * fdPer100) / 100).toFixed(2)}%`;
// No cheaper cube: either neither can beat the lines, or there's no final damage value to compare by.
const best = (it: PotentialItem) => CUBES.every((c) => it.cubes[c].cubesToBetter === null);

// The item row: cheapest to upgrade first, the meso per 1% final damage with the cheaper cube above each
// icon, which cube and 1 in how many cubes beats the current lines below; the border is the rank.
function ItemRow({ items, picked, onPick }: { items: PotentialItem[]; picked: string; onPick: (slot: string) => void }) {
  return (
    <>
      <div className="flame-row" role="group" aria-label="Items, cheapest to upgrade first">
        {items.map((it, i) => {
          // (a hat's "needed" cube has no meso per 1%: never the cheapest)
          const cheapest = i === 0 && it.cheaper !== null && it.cubes[it.cheaper].mesoPerFd !== null;
          const m = it.cheaper ? it.cubes[it.cheaper] : null;
          return (
            <div key={it.slot} className={`flame-cell pot-cell${cheapest ? " cheapest" : ""}`}>
              <span className="tag">{cheapest ? "cheapest" : ""}</span>
              <span className="above" title="Meso per 1% final damage, with the cheaper cube">
                {/* (a hat's cube needed for its minimum cooldown that adds nothing) */}
                {m && m.mesoPerFd === null ? "needed" : formatMeso(m?.mesoPerFd ?? null)}
              </span>
              <button type="button" className={`gear-icon rank-border-${it.rank ?? "none"}`} aria-pressed={picked === it.slot} aria-label={it.name} title={`${it.name} · ${it.rank ? rankName(it.rank) : "no potential"}`} onClick={() => onPick(it.slot)}>
                <ItemIcon item={it} />
              </button>
              <span className="below" title={m ? `${CUBE_NAMES[it.cheaper!]}: ${oneIn(m.better)} cubes beats the current lines` : best(it) ? "Neither cube can beat these lines" : "No final damage value to compare the cubes by"}>
                {it.cheaper && m ? (
                  <>
                    <Chip cube={it.cheaper} /> {oneIn(m.better).replace("1 in ", "1/")}
                  </>
                ) : best(it) ? (
                  "best"
                ) : (
                  "—"
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="tiny muted">Cheapest to upgrade first. Above each item: meso per 1% final damage with the cheaper cube (the cheapest in gold). Below: which cube, and 1 in how many cubes beats its lines. The border is its rank (dashed: no potential saved, counted as Rare).</p>
    </>
  );
}

// The picked item: its rank and lines to edit (saved with Save, like on the Equipment page), and what
// each cube would do to the saved ones. The numbers only change once saved.
function ItemPanel({ item, board, cube, onCube, fdPer100, saving, onSave, target, onClearTarget }: { item: PotentialItem; board: PotentialBoard; cube: Cube; onCube: (c: Cube) => void; fdPer100: number; saving: boolean; onSave: (p: Potential | null) => void; target: PotentialTarget | null; onClearTarget: () => void }) {
  const [draft, setDraft] = useState<Potential | null>(item.rank ? { rank: item.rank, lines: item.lines } : null);
  const dirty = changed(item, draft);
  const m = item.cubes[cube];
  const counts = m.cubesForChance.map((c) => c.cubes).filter((n): n is number => n !== null);
  const most = Math.max(...counts, 1);
  const options = draft ? (item.options[draft.rank] ?? [[], [], []]) : null;
  return (
    <section className="block" aria-label={`${item.name} potential`}>
      <div className="page-head">
        <h2>
          {item.name}{" "}
          <span className="muted small">
            Lv. {item.level} · <span className={item.rank ? `rank-${item.rank}` : ""}>{item.rank ? rankName(item.rank) : "No potential"}</span>
          </span>
        </h2>
        <span className="small">
          Score <b>{formatScore(item.score)}</b> <span className="muted">= {fd(item.score, fdPer100)} final damage · best {formatScore(item.best)}</span>
          {item.cooldown && <span className={`muted${item.cooldown.sec < item.cooldown.min ? " gold" : ""}`}> · {cooldownText(item.cooldown)}</span>}
        </span>
      </div>
      <div className="flame-split">
        <div className="pot-editor">
          <label className="small">
            <span className="muted">Rank</span>
            <select aria-label="Potential rank" value={draft?.rank ?? ""} onChange={(e) => setDraft(withRank(item, draft, (e.target.value || null) as Rank | null))}>
              <option value="">None</option>
              {POTENTIAL_RANKS.filter((r) => item.options[r]).map((r) => (
                <option key={r} value={r}>
                  {rankName(r)}
                </option>
              ))}
            </select>
            <span />
          </label>
          {draft &&
            options &&
            [0, 1, 2].map((i) => (
              <label key={i} className="small">
                <span className="muted">Line {i + 1}</span>
                <select aria-label={`Potential line ${i + 1}`} value={draft.lines[i] ?? ""} onChange={(e) => setDraft({ ...draft, lines: draft.lines.map((l, j) => (j === i ? e.target.value || null : l)) })}>
                  <option value="">— pick a line —</option>
                  {options[i]!.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <span className="pts tiny muted">{lineText(item, draft.lines[i] ?? null)}</span>
              </label>
            ))}
          <div className="row">
            <button type="button" className="btn" disabled={!dirty || saving} onClick={() => onSave(draft)}>
              Save
            </button>
            <button type="button" className="btn ghost" disabled={!dirty} onClick={() => setDraft(item.rank ? { rank: item.rank, lines: item.lines } : null)}>
              Cancel
            </button>
            <span className={dirty ? "small gold" : "tiny muted"}>{dirty ? `Unsaved: ${formatScore(liveScore(item.points, draft?.lines ?? [], item.ied, item.cooldown?.points ?? null))} score; the numbers update when you save` : item.rank ? "Saved (the same potential as on the Equipment page)" : "No potential saved: counted as Rare with no lines"}</span>
          </div>
          <p className="tiny muted">Each line lists what this item can roll at that rank, best first; the number is what it adds to the score (0: no damage for this character).</p>
        </div>
        <div>
          <div className="segmented" role="group" aria-label="Cube">
            {CUBES.map((c) => (
              <button key={c} type="button" aria-pressed={cube === c} onClick={() => onCube(c)}>
                {CUBE_NAMES[c]}
                {item.cheaper === c ? " · cheaper" : ""}
              </button>
            ))}
          </div>
          <div className="flame-tiles" style={{ marginTop: 10 }}>
            <div className="flame-tile">
              <div className="tiny muted">Meso / 1% FD</div>
              <div className="big">{formatMeso(m.mesoPerFd)}</div>
              <div className="tiny muted">{m.mesoPerFd === null && m.mesoToBetter !== null && item.cooldown && item.cooldown.sec < item.cooldown.min ? `none: a roll that keeps ${item.cooldown.min} s adds nothing here, but it's needed` : "cubing until it beats these lines"}</div>
            </div>
            <div className="flame-tile">
              <div className="tiny muted">Mesos to any better roll</div>
              <div className="big">{formatMeso(m.mesoToBetter)}</div>
              <div className="tiny muted">{m.cubesToBetter === null ? "already the best" : `≈ ${formatScore(m.cubesToBetter)} cubes on average`}</div>
            </div>
            <div className="flame-tile">
              <div className="tiny muted">Avg gain when it beats it</div>
              <div className="big">{m.gainIfBetter === null ? "—" : signedScore(m.gainIfBetter)}</div>
              {m.gainIfBetter !== null && <div className="tiny muted">≈ {m.gainIfBetter < 0 ? "−" : "+"}{fd(Math.abs(m.gainIfBetter), fdPer100)} final damage</div>}
            </div>
            <div className="flame-tile">
              <div className="tiny muted">Chance per cube of better</div>
              <div className="big">
                {oneIn(m.better)} {m.better > 0 && m.better < 1 && <span className="small muted">cubes</span>}
              </div>
              <div className="tiny muted">
                {fineChance(m.better)} a cube{m.rankUp > 0 ? ` · rank-up ${fineChance(m.rankUp)} a cube` : ""}
              </div>
            </div>
            <div className="flame-tile wide" role="group" aria-label="Cubes for a chance of a better result">
              <div className="tiny muted">Cubes for a chance of a better result · {cubePrice(board.prices[cube])} a cube</div>
              {m.cubesForChance.map(({ chance, cubes }) => (
                <div key={chance} className="chance-row small">
                  <span className="muted">{Math.round(chance * 100)}%</span>
                  <span className="chance-track">
                    <i style={{ width: `${cubes === null ? 0 : Math.max(3, (cubes / most) * 100)}%` }} />
                  </span>
                  <b>
                    {cubes === null ? "—" : cubes.toLocaleString("en-US")} {cubes !== null && <span className="muted">· {formatMeso(cubes * board.prices[cube])}</span>}
                  </b>
                </div>
              ))}
            </div>
            {target && (
              <div className="flame-tile wide" aria-label="Target">
                <div className="row between">
                  <span className="tiny muted">
                    To reach a score of at least <b>{formatScore(target.score)}</b>
                    {target.score > item.score && ` (+${fd(target.score - item.score, fdPer100)} final damage)`}
                  </span>
                  <button type="button" className="btn ghost tight" onClick={onClearTarget}>
                    Clear
                  </button>
                </div>
                {target.score <= item.score ? (
                  <div className="good">✓ already there</div>
                ) : (
                  CUBES.map((c) => (
                    <div key={c} className="kv-row small">
                      <Chip cube={c} />
                      <span>{target.cubes[c] ? `≈ ${formatScore(target.cubes[c]!.cubes)} cubes · ${formatMeso(target.cubes[c]!.meso)} on average` : "never"}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          {!target && <p className="tiny muted">Click a score on the distribution below to see what reaching it costs.</p>}
        </div>
      </div>
    </section>
  );
}

type PotentialTarget = { score: number; cubes: Record<Cube, { cubes: number; meso: number } | null> };

function Graph({ graph, item, cube, target, onTarget }: { graph: ReturnType<typeof usePotentialGraph>; item: PotentialItem; cube: Cube; target: number | null; onTarget: (score: number) => void }) {
  const [mode, setMode] = useState<ChartMode>("dist");
  const g = graph.data?.cubes[cube];
  return (
    <section className="block" aria-label="One cube's result">
      <div className="page-head">
        <h2>
          One {CUBE_NAMES[cube]} Cube's result <span className="muted small">{item.name}</span>
        </h2>
        <div className="segmented" role="group" aria-label="Graph">
          {CHART_MODES.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {g ? <FlameChart graph={g} current={item.score} mode={mode} per="cube" target={target} onPick={onTarget} /> : graph.isError ? <p className="error">Couldn't load the graph: {graph.error.message}</p> : <p className="muted small">Loading…</p>}
      <p className="tiny muted">
        {mode === "dist"
          ? `Every score one cube can give (${g?.distribution.length.toLocaleString("en-US") ?? "…"} of them, rank-ups included), each with its chance; past your score, a better roll. Click one to see what reaching it costs.`
          : mode === "cost"
            ? "The meso per +1 score cubing costs on average (cubing until a better roll, at Legendary), if your lines had that score. It climbs steeply near the top."
            : "The score one cube adds on average (cubing until a better roll, at Legendary), if your lines had that score."}
        {g && g.short > 0 && item.cooldown && ` Rolls under the ${item.cooldown.min} s the hat must keep (${fineChance(g.short)} of cubes) aren't shown: they don't count.`}
      </p>
    </section>
  );
}

// Targets: the score to stop cubing each item at, for what 1% final damage is worth spending.
function Targets({ board, budget, onBudget }: { board: PotentialBoard; budget: number; onBudget: (meso: number) => void }) {
  return (
    <section className="block" aria-label="Targets">
      <BudgetBox budget={budget} onBudget={onBudget} />
      <p className="tiny muted">Each item's score to stop cubing at (at Legendary): past it, cubing on costs more than that per 1% final damage with either cube. "To get there" uses the cheaper cube, rank-ups included.</p>
      <table className="flame-targets">
        <thead>
          <tr>
            <th />
            <th>Item</th>
            <th>Rank</th>
            <th>Score now</th>
            <th>Stop at</th>
            <th>To get there</th>
          </tr>
        </thead>
        <tbody>
          {board.items.map((it) => (
            <tr key={it.slot}>
              <td>
                <ItemIcon item={it} />
              </td>
              <td>{it.name}</td>
              <td className={it.rank ? `rank-${it.rank}` : "muted"}>{it.rank ? rankName(it.rank) : "None"}</td>
              <td>
                <b>{formatScore(it.score)}</b>
              </td>
              <td>{it.stop ? formatScore(it.stop.score) : "—"}</td>
              <td>
                {!it.stop ? (
                  "—"
                ) : it.stop.reached ? (
                  <span className="good">✓ reached</span>
                ) : (
                  <>
                    <Chip cube={it.stop.cube} /> ≈ {formatScore(it.stop.cubes)} cubes · {formatMeso(it.stop.meso)}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// The Gear group's Potential page: each item's potential score, and what Glowing and Bright Cubes would
// do to it (Upgrade), or where to stop for a budget (Targets).
export function PotentialPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const gear = useGear(world);
  const saveDetails = useSaveGearDetails(world);
  const saveValues = useSaveStatValues(world);
  useRefreshStatus();
  const [picked, setPicked] = useGearCharacter();
  const [view, setView] = useState<"upgrade" | "targets">("upgrade");
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [params, setParams] = useSearchParams();
  // the item and events from a link (the Upgrades page's), else the first item and none
  const [on, setOn] = useState<ReadonlySet<CubeEvent>>(() => eventsFrom(params.get("events"), CUBE_EVENTS));
  // the item picked: from a link (the Upgrades page's ?item=<slot>), else the first
  const [slot, setSlot] = useState<string | null>(params.get("item"));
  // the cube shown (null: the item's cheaper one) and the target score picked on the graph
  const [cube, setCube] = useState<Cube | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const events = cubeEventsParam(on);
  // the address follows the item picked and the events (a reload keeps them)
  useEffect(() => setParams(pageQuery(slot, events), { replace: true }), [slot, events, setParams]);
  const b = gear.data;
  const c = b?.characters.find((x) => x.id === picked) ?? b?.characters[0];
  const potential = usePotential(c?.id, events, budget);
  const board = potential.data;
  const item = board?.items.find((i) => i.slot === slot) ?? board?.items[0];
  const shownCube = cube ?? item?.cheaper ?? "glowing";
  const graph = usePotentialGraph(c?.id, item?.slot, events, target);
  const failed = saveDetails.error ?? saveValues.error ?? saveSettings.error;
  // a failed save's message belongs to the character it was for (as on the Equipment page)
  const resetSaves = () => {
    saveDetails.reset();
    saveValues.reset();
    saveSettings.reset();
  };
  const pickItem = (s: string | null) => {
    setSlot(s);
    setCube(null);
    setTarget(null);
  };
  const save = (it: PotentialItem, p: Potential | null) => {
    // stay on this item when the save re-orders the row
    setSlot(it.slot);
    setTarget(null);
    saveDetails.mutate({ id: c!.id, slot: it.slot, details: withPotential(c!.details[it.slot], it.starMin, p) });
  };
  const toggle = (k: CubeEvent, checked: boolean) => {
    const next = new Set(on);
    if (checked) next.add(k);
    else next.delete(k);
    setOn(next);
  };

  return (
    <>
      <h1 className="visually-hidden">Potential</h1>
      <GearTop
        world={world}
        onWorld={(w) => {
          resetSaves();
          pickItem(null);
          saveSettings.mutate({ worldId: w });
        }}
        characters={b?.characters}
        current={c}
        onPick={(id) => {
          resetSaves();
          setPicked(id);
          pickItem(null);
        }}
      />
      {failed && (
        <p className="error block" role="alert">
          {failed.message}
        </p>
      )}
      {(gear.isError || potential.isError) && (
        <p className="error block" role="alert">
          Couldn't load the potential: {(gear.error ?? potential.error)!.message}
        </p>
      )}
      {(gear.isPending || (c && potential.isPending)) && <p className="notice muted block">Loading…</p>}
      {b?.characters.length === 0 && <NoCharacters world={world} />}
      {c && board && (
        <>
          <section className="block">
            <div className="page-head">
              <div className="row">
                <h2>Potential</h2>
                <div className="segmented" role="group" aria-label="View">
                  <button type="button" aria-pressed={view === "upgrade"} onClick={() => setView("upgrade")}>
                    Upgrade
                  </button>
                  <button type="button" aria-pressed={view === "targets"} onClick={() => setView("targets")}>
                    Targets
                  </button>
                </div>
              </div>
              <div className="row small muted">
                <span>Events:</span>
                {CUBE_EVENT_LABELS.map(([k, label]) => (
                  <label key={k}>
                    <input type="checkbox" checked={on.has(k)} onChange={(e) => toggle(k, e.target.checked)} /> {label}
                  </label>
                ))}
              </div>
            </div>
            <p className="tiny muted">
              {c.name} · {c.job} · Glowing {cubePrice(board.prices.glowing)} · Bright {cubePrice(board.prices.bright)} a cube (the Heroic Cube Shop) · rank-up chances are community estimates (Nexon publishes none for GMS) · final damage per 100 score: {c.statValues.fdPer100}%
            </p>
            {!board.known ? (
              <p className="notice">{c.job} isn't in the item list yet, so its main stat isn't known and its potential can't be scored.</p>
            ) : board.items.length === 0 ? (
              <p className="notice muted">No equipped items that can have potential. Equip some on the Equipment page (a typed item needs its level there first).</p>
            ) : (
              view === "upgrade" && item && <ItemRow items={board.items} picked={item.slot} onPick={pickItem} />
            )}
          </section>
          {board.known && item && view === "upgrade" && (
            <>
              <ItemPanel
                key={`${c.id}-${item.slot}-${item.rank}-${item.lines.join("|")}`}
                item={item}
                board={board}
                cube={shownCube}
                onCube={setCube}
                fdPer100={c.statValues.fdPer100}
                saving={saveDetails.isPending}
                onSave={(p) => save(item, p)}
                target={target !== null && graph.data?.target?.score === target ? graph.data.target : null}
                onClearTarget={() => setTarget(null)}
              />
              <Graph graph={graph} item={item} cube={shownCube} target={target} onTarget={setTarget} />
            </>
          )}
          {board.known && board.items.length > 0 && view === "targets" && <Targets board={board} budget={budget} onBudget={setBudget} />}
          <section className="block" aria-label="Stat values">
            <StatValuesBox c={c} onSave={(values) => saveValues.mutate({ id: c.id, values })} />
          </section>
        </>
      )}
    </>
  );
}

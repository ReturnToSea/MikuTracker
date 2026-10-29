import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import type { GearDetailsInput } from "@miku/shared";
import { useFlameGraph, useFlames, useGear, useRefreshStatus, useSaveGearDetails, useSaveStatValues, useSettings, useUpdateSettings } from "../api/hooks";
import type { FlameItem, FlamesBoard, GearCharacter } from "../api/types";
import { CHART_MODES, type ChartMode, FlameChart } from "../components/FlameChart";
import { FlameTable, StatValuesBox } from "../components/GearDetails";
import { BudgetBox, GearTop, ItemIcon, NoCharacters, useGearCharacter } from "../components/GearTop";
import { DEFAULT_BUDGET, formatChance, formatMeso, formatScore, priceFromMillions, withFlames } from "../lib/flames";
import { pageQuery } from "../lib/upgrades";

const same = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// The price of a Black Flame (one for the whole site), in millions; saved when you leave the box.
function PriceBox({ price, onSave }: { price: number; onSave: (meso: number) => void }) {
  const [text, setText] = useState(String(price / 1_000_000));
  useEffect(() => setText(String(price / 1_000_000)), [price]);
  const commit = () => {
    const meso = priceFromMillions(text);
    if (meso !== null && meso !== price) onSave(meso);
    else setText(String(price / 1_000_000));
  };
  return (
    <label className="small muted">
      Black Flame price{" "}
      <input className="text-input count" type="number" step="any" min={0} aria-label="Black Flame price (millions)" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
      m
    </label>
  );
}

// The item row: cheapest to upgrade first, the meso per 1% final damage above each icon and the chance
// of a better flame below.
function ItemRow({ items, picked, onPick }: { items: FlameItem[]; picked: string; onPick: (slot: string) => void }) {
  return (
    <>
      <div className="flame-row" role="group" aria-label="Items, cheapest to upgrade first">
        {items.map((it, i) => {
          const cheapest = i === 0 && it.metrics.mesoPerFd !== null;
          return (
            <div key={it.slot} className={`flame-cell${cheapest ? " cheapest" : ""}`}>
              <span className="tag">{cheapest ? "cheapest" : ""}</span>
              <span className="above" title="Meso per 1% final damage">
                {formatMeso(it.metrics.mesoPerFd)}
              </span>
              <button type="button" className="gear-icon" aria-pressed={picked === it.slot} aria-label={it.name} title={it.name} onClick={() => onPick(it.slot)}>
                <ItemIcon item={it} />
              </button>
              <span className="below" title="Chance one Black Flame beats its flames">
                {formatChance(it.metrics.better)} better
              </span>
            </div>
          );
        })}
      </div>
      <p className="tiny muted">Cheapest to upgrade first. Above each item: meso per 1% final damage (the cheapest in gold). Below: the chance one Black Flame beats its flames.</p>
    </>
  );
}

// The picked item: its flames to click (saved with Save, like on the Equipment page), and what a Black
// Flame would do to the saved ones. The numbers only change once saved.
function ItemPanel({ item, price, saving, onSave }: { item: FlameItem; price: number; saving: boolean; onSave: (flames: Record<string, number>) => void }) {
  const [draft, setDraft] = useState(item.flames);
  const dirty = !same(draft, item.flames);
  const m = item.metrics;
  const counts = m.flamesForChance.map((c) => c.flames).filter((n): n is number => n !== null);
  const most = Math.max(...counts, 1);
  return (
    <section className="block" aria-label={`${item.name} flames`}>
      <h2>
        {item.name}{" "}
        <span className="muted small">
          Lv. {item.level}
          {item.boss ? " · boss item" : ""}
        </span>
      </h2>
      <div className="flame-split">
        <div>
          <FlameTable rows={item.grid} flames={draft} onChange={setDraft} />
          <div className="row">
            <button type="button" className="btn" disabled={!dirty || saving} onClick={() => onSave(draft)}>
              Save
            </button>
            <button type="button" className="btn ghost" disabled={!dirty} onClick={() => setDraft(item.flames)}>
              Cancel
            </button>
            <span className={dirty ? "small gold" : "tiny muted"}>{dirty ? "Unsaved changes: the numbers update when you save" : "Saved (the same flames as on the Equipment page)"}</span>
          </div>
        </div>
        <div className="flame-tiles">
          <div className="flame-tile wide">
            <div className="tiny muted">Flame score</div>
            <div className="big">
              {formatScore(item.score)}{" "}
              <span className="muted small">
                / {formatScore(item.best)} best · beats {formatChance(m.beats)} of rolls
              </span>
            </div>
          </div>
          <div className="flame-tile">
            <div className="tiny muted">Meso spend / 1% FD</div>
            <div className="big">{formatMeso(m.mesoPerFd)}</div>
            <div className="tiny muted">for the next flame, on average</div>
          </div>
          <div className="flame-tile">
            <div className="tiny muted">Mesos to any better roll</div>
            <div className="big">{formatMeso(m.mesoToBetter)}</div>
            <div className="tiny muted">{m.flamesToBetter === null ? "already the best" : `≈ ${formatScore(m.flamesToBetter)} flames on average`}</div>
          </div>
          <div className="flame-tile">
            <div className="tiny muted">Avg score gain if better</div>
            <div className="big">{m.gainIfBetter === null ? "—" : `+${formatScore(m.gainIfBetter)}`}</div>
          </div>
          <div className="flame-tile">
            <div className="tiny muted">Chance per flame</div>
            <div className="big">{formatChance(m.better)}</div>
            <div className="tiny muted">of a better result</div>
          </div>
          <div className="flame-tile wide" role="group" aria-label="Flames needed for a chance of a better result">
            <div className="tiny muted">Flames needed for a chance of a better result</div>
            {m.flamesForChance.map(({ chance, flames }) => (
              <div key={chance} className="chance-row small">
                <span className="muted">{Math.round(chance * 100)}%</span>
                <span className="chance-track">
                  <i style={{ width: `${flames === null ? 0 : Math.max(3, (flames / most) * 100)}%` }} />
                </span>
                <b>
                  {flames === null ? "—" : flames.toLocaleString("en-US")} {flames !== null && <span className="muted">· {formatMeso(flames * price)}</span>}
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Graph({ c, item }: { c: GearCharacter; item: FlameItem }) {
  const [mode, setMode] = useState<ChartMode>("dist");
  const graph = useFlameGraph(c.id, item.slot);
  return (
    <section className="block" aria-label="One flame's score">
      <div className="page-head">
        <h2>One flame's score</h2>
        <div className="segmented" role="group" aria-label="Graph">
          {CHART_MODES.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {graph.data ? <FlameChart graph={graph.data} current={item.score} mode={mode} /> : graph.isError ? <p className="error">Couldn't load the graph: {graph.error.message}</p> : <p className="muted small">Loading…</p>}
      <p className="tiny muted">
        {mode === "dist"
          ? `Every score one Black Flame can give (${graph.data?.distribution.length.toLocaleString("en-US") ?? "…"} of them), each with its chance; past your score, a better roll.`
          : mode === "cost"
            ? "The meso per +1 score one flame costs on average, if your flames had that score. It climbs steeply near the top."
            : "The score one flame adds on average, if your flames had that score (worse rolls add nothing: a Black Flame keeps the old flames)."}
      </p>
    </section>
  );
}

// Targets: the score to stop flaming each item at, for what 1% final damage is worth spending
// (mafhcow's "inverse target mode", for the character's own items).
function Targets({ board, budget, onBudget }: { board: FlamesBoard; budget: number; onBudget: (meso: number) => void }) {
  return (
    <section className="block" aria-label="Targets">
      <BudgetBox budget={budget} onBudget={onBudget} />
      <p className="tiny muted">Each item's score to stop flaming at: past it, one more flame costs more than that per 1% final damage.</p>
      <table className="flame-targets">
        <thead>
          <tr>
            <th />
            <th>Item</th>
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
              <td>
                <b>{formatScore(it.score)}</b>
              </td>
              <td>{it.stop ? formatScore(it.stop.score) : "—"}</td>
              <td>
                {!it.stop ? "—" : it.stop.reached ? <span className="good">✓ reached</span> : `≈ ${formatScore(it.stop.flames)} flames · ${formatMeso(it.stop.meso)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// The Gear group's Flames page: each flameable item's flame score, and what Black Flames would do to
// it (Upgrade), or where to stop for a budget (Targets).
export function FlamesPage() {
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
  // the item picked: from a link (the Upgrades page's ?item=<slot>), else the first
  const [params, setParams] = useSearchParams();
  const [slot, setSlot] = useState<string | null>(params.get("item"));
  // the address follows the item picked (a reload keeps it)
  useEffect(() => setParams(pageQuery(slot, ""), { replace: true }), [slot, setParams]);
  const b = gear.data;
  const c = b?.characters.find((x) => x.id === picked) ?? b?.characters[0];
  const flames = useFlames(c?.id, budget);
  const board = flames.data;
  const item = board?.items.find((i) => i.slot === slot) ?? board?.items[0];
  const failed = saveDetails.error ?? saveValues.error ?? saveSettings.error;
  // a failed save's message belongs to the character it was for (as on the Equipment page)
  const resetSaves = () => {
    saveDetails.reset();
    saveValues.reset();
    saveSettings.reset();
  };
  const save = (it: FlameItem, f: Record<string, number>) => {
    // stay on this item when the save re-orders the row
    setSlot(it.slot);
    const details: GearDetailsInput = withFlames(c!.details[it.slot], it.starMin, f);
    saveDetails.mutate({ id: c!.id, slot: it.slot, details });
  };

  return (
    <>
      <h1 className="visually-hidden">Flames</h1>
      <GearTop
        world={world}
        onWorld={(w) => {
          resetSaves();
          setSlot(null);
          saveSettings.mutate({ worldId: w });
        }}
        characters={b?.characters}
        current={c}
        onPick={(id) => {
          resetSaves();
          setPicked(id);
          setSlot(null);
        }}
      />
      {failed && (
        <p className="error block" role="alert">
          {failed.message}
        </p>
      )}
      {(gear.isError || flames.isError) && (
        <p className="error block" role="alert">
          Couldn't load the flames: {(gear.error ?? flames.error)!.message}
        </p>
      )}
      {(gear.isPending || (c && flames.isPending)) && <p className="notice muted block">Loading…</p>}
      {b?.characters.length === 0 && <NoCharacters world={world} />}
      {c && board && (
        <>
          <section className="block">
            <div className="page-head">
              <div className="row">
                <h2>Flames</h2>
                <div className="segmented" role="group" aria-label="View">
                  <button type="button" aria-pressed={view === "upgrade"} onClick={() => setView("upgrade")}>
                    Upgrade
                  </button>
                  <button type="button" aria-pressed={view === "targets"} onClick={() => setView("targets")}>
                    Targets
                  </button>
                </div>
              </div>
              {settings.data && <PriceBox price={settings.data.blackFlamePrice} onSave={(meso) => saveSettings.mutate({ blackFlamePrice: meso })} />}
            </div>
            <p className="tiny muted">
              {c.name} · {c.job} · Black Flames (the old flames are kept when a roll is worse) · final damage per 100 score: {c.statValues.fdPer100}%
            </p>
            {!board.known ? (
              <p className="notice">{c.job} isn't in the item list yet, so its main stat isn't known and its flames can't be scored.</p>
            ) : board.items.length === 0 ? (
              <p className="notice muted">No equipped items that can have flames. Equip some on the Equipment page (a typed item needs its level and boss tick there first).</p>
            ) : (
              view === "upgrade" && item && <ItemRow items={board.items} picked={item.slot} onPick={setSlot} />
            )}
          </section>
          {board.known && item && view === "upgrade" && (
            <>
              <ItemPanel key={`${c.id}-${item.slot}-${JSON.stringify(item.flames)}`} item={item} price={board.price} saving={saveDetails.isPending} onSave={(f) => save(item, f)} />
              <Graph c={c} item={item} />
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

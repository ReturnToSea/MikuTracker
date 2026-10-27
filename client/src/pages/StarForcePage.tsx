import { useEffect, useState } from "react";
import { MVP_TIERS } from "@miku/shared";
import { useGear, useRefreshStatus, useSaveGearDetails, useSaveStatValues, useSettings, useStarForce, useStarForceDetail, useUpdateSettings } from "../api/hooks";
import type { GearCharacter, StarForceBoard, StarForceItem } from "../api/types";
import { Stars, StatValuesBox } from "../components/GearDetails";
import { BudgetBox, GearTop, ItemIcon, NoCharacters, useGearCharacter } from "../components/GearTop";
import { SF_CHART_MODES, type SfChartMode, StarForceChart } from "../components/StarForceChart";
import { clickStar } from "../lib/gearDetails";
import { DEFAULT_BUDGET, formatChance, formatMeso } from "../lib/flames";
import { boomCostFrom, eventsParam, formatRate, jumpSpans, SF_EVENT_LABELS, type SfEventKey, withBoomSettings, withStars } from "../lib/starForce";

const MVP_LABELS: Record<(typeof MVP_TIERS)[number], string> = { none: "None", silver: "Silver (3%)", gold: "Gold (5%)", diamond: "Diamond or higher (10%)" };
const fdText = (fd: number) => `+${fd.toFixed(2)}%`;

// The item row: cheapest per 1% final damage first; above each icon its best jump's meso per 1% FD and
// the star it reaches, below the next tap's success chance.
function ItemRow({ items, picked, onPick }: { items: StarForceItem[]; picked: string; onPick: (slot: string) => void }) {
  return (
    <>
      <div className="flame-row" role="group" aria-label="Items, cheapest to upgrade first">
        {items.map((it, i) => {
          const cheapest = i === 0 && it.best.perFd !== null;
          return (
            <div key={it.slot} className={`flame-cell${cheapest ? " cheapest" : ""}`}>
              <span className="tag">{cheapest ? "cheapest" : ""}</span>
              <span className="above" title="Meso per 1% final damage, for its best jump">
                {formatMeso(it.best.perFd)}
              </span>
              <span className="tiny muted">→ {it.best.to}★</span>
              <button type="button" className="gear-icon" aria-pressed={picked === it.slot} aria-label={it.name} title={it.name} onClick={() => onPick(it.slot)}>
                <ItemIcon item={it} />
                <span className="icon-stars">{it.star}</span>
              </button>
              <span className="below" title="The next tap's success chance">
                {formatRate(it.next.success)} next
              </span>
            </div>
          );
        })}
      </div>
      <p className="tiny muted">Cheapest to upgrade first: above each item, the meso per 1% final damage of its best jump from where it is (and that jump's star); below, the next tap's success chance. Items with fixed stars or at their limit aren't listed.</p>
    </>
  );
}

// The boom cost (plain meso) and the boxes for an item too rare to risk; each saved as soon as it changes.
function BoomSettings({ item, onSave }: { item: StarForceItem; onSave: (cost: number, safety: StarForceItem["safety"]) => void }) {
  const [text, setText] = useState(String(item.boomCost));
  useEffect(() => setText(String(item.boomCost)), [item.boomCost]);
  // the boxes tick at once, then save (and follow what's saved when it comes back)
  const [safety, setSafety] = useState(item.safety);
  useEffect(() => setSafety(item.safety), [item.safety]);
  const commit = () => {
    const n = boomCostFrom(text);
    if (n !== null && n !== item.boomCost) onSave(n, safety);
    else setText(String(item.boomCost));
  };
  const box = (preset: "1144" | "4444", label: string) => (
    <label>
      <input
        type="checkbox"
        checked={safety === preset}
        onChange={(e) => {
          const next = e.target.checked ? preset : null;
          setSafety(next);
          // the cost as typed (even if its box hasn't been left yet), so the pair is saved together
          onSave(boomCostFrom(text) ?? item.boomCost, next);
        }}
      />{" "}
      {label}
    </label>
  );
  return (
    <div className="sf-boom small muted">
      <label>
        Boom cost <input className="text-input" style={{ width: 150 }} type="number" min={0} step={1} aria-label="Boom cost (meso)" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} /> meso
      </label>
      <span className="tiny">(replacing or restoring it; 0: booms counted, not priced)</span>
      <div role="group" aria-label="Too rare to risk" className="row">
        <span>Too rare to risk:</span>
        {box("1144", "Modes 1 1 4 4")}
        {box("4444", "Modes 4 4 4 4")}
      </div>
      <div className="tiny">For 18→22★. 1 1 4 4: no Safeguard before 18★ (Mode 1); 4 4 4 4: Safeguard 15→18★. From 22★ there's no mode, so those stars can still boom.</div>
    </div>
  );
}

// The picked item: its stars (saved with Save, like on Equipment), its boom settings, the summary for the
// target, each next star, and the graph. The numbers only change once saved.
function ItemPanel({ c, item, events, target, onTarget, saving, onSaveStars, onSaveBoom }: { c: GearCharacter; item: StarForceItem; events: string; target: number; onTarget: (n: number) => void; saving: boolean; onSaveStars: (n: number) => void; onSaveBoom: (cost: number, safety: StarForceItem["safety"]) => void }) {
  const [draft, setDraft] = useState(item.star);
  const [mode, setMode] = useState<SfChartMode>("cost");
  const detail = useStarForceDetail(c.id, item.slot, events, target);
  const d = detail.data;
  const dirty = draft !== item.star;
  const spans = d ? jumpSpans(d.rows, d.jumps) : [];
  const firstJump = d?.jumps[0];
  return (
    <>
      <section className="block" aria-label={`${item.name} Star Force`}>
        <div className="page-head">
          <h2>
            {item.name}{" "}
            <span className="muted small">
              Lv. {item.level} · {item.star}★ now
            </span>
          </h2>
          <BoomSettings item={item} onSave={onSaveBoom} />
        </div>
        <Stars value={draft} min={item.min} max={item.max} onChange={(n) => setDraft(clickStar(draft, n, item.min, item.max))} />
        <div className="row">
          <b className="gold">{draft}★</b>
          <span className="muted small">/ {item.max}</span>
          <button type="button" className="btn" disabled={!dirty || saving} onClick={() => onSaveStars(draft)}>
            Save
          </button>
          <button type="button" className="btn ghost" disabled={!dirty} onClick={() => setDraft(item.star)}>
            Cancel
          </button>
          <span className={dirty ? "small gold" : "tiny muted"}>{dirty ? "Unsaved: the numbers update when you save" : "Saved (the same stars as on the Equipment page)"}</span>
        </div>
        {!d ? (
          detail.isError ? <p className="error">Couldn't load the numbers: {detail.error.message}</p> : <p className="muted small">Working it out…</p>
        ) : (
          <>
            <div className="sf-tiles" role="group" aria-label="Summary">
              <div className="flame-tile"><div className="tiny muted">Median cost</div><div className="big">{formatMeso(d.summary.median)}</div><div className="tiny muted">half of runs cost less</div></div>
              <div className="flame-tile"><div className="tiny muted">Average cost</div><div className="big">{formatMeso(d.summary.average)}</div><div className="tiny muted">exact</div></div>
              <div className="flame-tile"><div className="tiny muted">Unlucky: 75 / 90 / 99%</div><div className="mid">{d.summary.unlucky.map(formatMeso).join(" · ")}</div><div className="tiny muted">runs cost at most this</div></div>
              <div className="flame-tile"><div className="tiny muted">Final damage</div><div className="big">{fdText(d.summary.fd)}</div><div className="tiny muted">{formatMeso(d.summary.perFd)} per 1%</div></div>
              <div className="flame-tile"><div className="tiny muted">Median booms</div><div className="big">{d.summary.medianBooms}</div><div className="tiny muted">half of runs boom less</div></div>
              <div className="flame-tile"><div className="tiny muted">Average booms</div><div className="big">{d.summary.averageBooms.toFixed(2)}</div><div className="tiny muted">exact</div></div>
              <div className="flame-tile"><div className="tiny muted">At least one boom</div><div className="big">{formatChance(d.summary.anyBoom)}</div><div className="tiny muted">{d.summary.canBoom ? "of runs" : `no star up to ${d.target}★ can boom`}</div></div>
              <div className="flame-tile"><div className="tiny muted">Booms priced at</div><div className="big">{item.boomCost ? formatMeso(item.boomCost) : "0"}</div><div className="tiny muted">each (its boom cost)</div></div>
            </div>
            <p className="tiny muted">
              {item.star}★ → {d.target}★ · the averages are exact; the medians, unlucky costs and the chance of a boom come from 20,000 simulated runs.
            </p>
            <div className="flames-scroll">
              <table className="sf-steps">
                <thead>
                  <tr>
                    <th>Star</th>
                    <th>Pick</th>
                    <th>Success</th>
                    <th>Boom</th>
                    <th>Per tap</th>
                    <th>Avg cost</th>
                    <th>Final damage</th>
                    <th>This star: meso / 1% FD</th>
                    <th>Cost from {item.star}★</th>
                    <th>FD from {item.star}★</th>
                    <th>Best jump</th>
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r, i) => {
                    const j = d.jumps.find((x) => x.from === r.from);
                    return (
                      <tr key={r.from} className={r.to === d.target ? "target" : undefined} onClick={() => onTarget(r.to)} aria-selected={r.to === d.target}>
                        <td>
                          {/* (its click reaches the row's) */}
                          <button type="button" className="link-button">
                            {r.from}→{r.to}★
                          </button>
                        </td>
                        <td>
                          <span className="mode-pill">{r.pick}</span>
                        </td>
                        <td>{formatRate(r.success)}</td>
                        <td>{formatRate(r.boom)}</td>
                        <td>{formatMeso(r.tapCost)}</td>
                        <td>{formatMeso(r.avgCost)}</td>
                        <td>{fdText(r.fd)}</td>
                        <td>{formatMeso(r.perFd)}</td>
                        <td>{formatMeso(r.costFrom)}</td>
                        <td>{fdText(r.fdFrom)}</td>
                        {j && (
                          <td rowSpan={spans[i]} className={`jump${j === firstJump ? " first" : ""}`}>
                            <b>
                              {j.from}→{j.to}★
                            </b>
                            <br />
                            {formatMeso(j.perFd)} / 1%
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="tiny muted">Click a row to plan to that star. "Pick": the cheapest Enhancement Mode or Safeguard for that star (booms and their price included; "—": nothing to choose). Avg cost: exact, with climbs back after booms. "Best jump": from where you'd stand, the cheapest meso per 1% FD to any higher star (several stars together when a cheap star follows a dear one); the first, in gold, is what the item row shows.</p>
          </>
        )}
      </section>
      {d && (
        <section className="block" aria-label="Star Force graph">
          <div className="page-head">
            <h2>{mode === "perStar" ? `Each next star, up to ${d.target}★` : `${item.star}★ → ${d.target}★`}</h2>
            <div className="segmented" role="group" aria-label="Graph">
              {SF_CHART_MODES.map(([m, label]) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <StarForceChart detail={d} mode={mode} />
          <p className="tiny muted">
            {mode === "cost"
              ? "Every total cost a run can come to (20,000 simulated runs), with the median and the 75/90/99% marks."
              : mode === "booms"
                ? "How many booms a run to the target takes: every count up to where 99.5% of runs end (the rare rest in the last, marked +)."
                : "The average cost of each next star (booms and climbing back included), on a scale where each line is ten times the one below: where it gets steep."}
          </p>
        </section>
      )}
    </>
  );
}

// Targets: the star to stop at for each item, for what 1% final damage is worth spending.
function Targets({ board, budget, onBudget }: { board: StarForceBoard; budget: number; onBudget: (meso: number) => void }) {
  return (
    <section className="block" aria-label="Targets">
      <BudgetBox budget={budget} onBudget={onBudget} />
      <p className="tiny muted">The star to stop at: from where each item is, the best jump (all in) is taken while it costs at most that per 1% final damage, then again from there. Each item's own boom cost and boxes count.</p>
      <table className="flame-targets">
        <thead>
          <tr>
            <th />
            <th>Item</th>
            <th>Now</th>
            <th>Stop at</th>
            <th>To get there (average)</th>
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
                <b>{it.star}★</b>
              </td>
              <td>{it.stop.star}★</td>
              <td>{it.stop.star === it.star ? <span className="good">✓ there</span> : `${formatMeso(it.stop.cost)} · ${fdText(it.stop.fd)} final damage`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// The Gear group's Star Force page: each item that can take more stars, what its next stars cost and
// add (Upgrade), or where to stop for a budget (Targets).
export function StarForcePage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const gear = useGear(world);
  const saveDetails = useSaveGearDetails(world);
  const saveValues = useSaveStatValues(world);
  useRefreshStatus();
  const [picked, setPicked] = useGearCharacter();
  const [view, setView] = useState<"upgrade" | "targets">("upgrade");
  const [events, setEvents] = useState<Set<SfEventKey>>(new Set());
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [slot, setSlot] = useState<string | null>(null);
  // the star planned to (cleared whenever the item changes)
  const [target, setTarget] = useState<number | null>(null);
  const b = gear.data;
  const c = b?.characters.find((x) => x.id === picked) ?? b?.characters[0];
  const ev = eventsParam(events);
  const sf = useStarForce(c?.id, ev, budget);
  const board = sf.data;
  const item = board?.items.find((i) => i.slot === slot) ?? board?.items[0];
  const failed = saveDetails.error ?? saveValues.error ?? saveSettings.error;
  const resetSaves = () => {
    saveDetails.reset();
    saveValues.reset();
    saveSettings.reset();
  };
  const pick = (s: string) => {
    setSlot(s);
    setTarget(null);
  };
  const toggle = (k: SfEventKey, on: boolean) =>
    setEvents((cur) => {
      const next = new Set(cur);
      if (on) next.add(k);
      else next.delete(k);
      return next;
    });

  return (
    <>
      <h1 className="visually-hidden">Star Force</h1>
      <GearTop
        world={world}
        onWorld={(w) => {
          resetSaves();
          pick("");
          saveSettings.mutate({ worldId: w });
        }}
        characters={b?.characters}
        current={c}
        onPick={(id) => {
          resetSaves();
          setPicked(id);
          pick("");
        }}
      />
      {failed && (
        <p className="error block" role="alert">
          {failed.message}
        </p>
      )}
      {(gear.isError || sf.isError) && (
        <p className="error block" role="alert">
          Couldn't load Star Force: {(gear.error ?? sf.error)!.message}
        </p>
      )}
      {(gear.isPending || (c && sf.isPending)) && <p className="notice muted block">Loading…</p>}
      {b?.characters.length === 0 && <NoCharacters world={world} />}
      {c && board && (
        <>
          <section className="block">
            <div className="page-head">
              <div className="row">
                <h2>Star Force</h2>
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
                {SF_EVENT_LABELS.map(([k, label]) => (
                  <label key={k}>
                    <input type="checkbox" checked={events.has(k)} onChange={(e) => toggle(k, e.target.checked)} /> {label}
                  </label>
                ))}
                <label>
                  MVP{" "}
                  <select aria-label="MVP" value={settings.data?.mvp ?? board.mvp} onChange={(e) => saveSettings.mutate({ mvp: e.target.value as (typeof MVP_TIERS)[number] })}>
                    {MVP_TIERS.map((m) => (
                      <option key={m} value={m}>
                        {MVP_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <p className="tiny muted">
              {c.name} · {c.job} · Shining Star Force is 30% off and 30% fewer booms together · final damage per 100 score: {c.statValues.fdPer100}%
            </p>
            {!board.known ? (
              <p className="notice">{c.job} isn't in the item list yet, so its main stat isn't known and its stars' final damage can't be worked out.</p>
            ) : board.items.length === 0 ? (
              <p className="notice muted">No equipped items that can take more stars. Equip some on the Equipment page (a typed item needs its level there first).</p>
            ) : (
              view === "upgrade" && item && <ItemRow items={board.items} picked={item.slot} onPick={pick} />
            )}
          </section>
          {board.known && item && view === "upgrade" && (
            <ItemPanel
              key={`${c.id}-${item.slot}-${item.star}`}
              c={c}
              item={item}
              events={ev}
              target={target ?? item.best.to}
              onTarget={(star) => {
                setSlot(item.slot);
                setTarget(star);
              }}
              saving={saveDetails.isPending}
              onSaveStars={(n) => {
                // stay on this item when the save re-orders the row; plan afresh from its new star
                setSlot(item.slot);
                setTarget(null);
                saveDetails.mutate({ id: c.id, slot: item.slot, details: withStars(c.details[item.slot], item.min, n) });
              }}
              onSaveBoom={(cost, safety) => {
                setSlot(item.slot);
                saveDetails.mutate({ id: c.id, slot: item.slot, details: withBoomSettings(c.details[item.slot], item.min, cost, safety) });
              }}
            />
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

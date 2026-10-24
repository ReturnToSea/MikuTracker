import { type GearDetailsInput, POTENTIAL_RANKS, STAT_VALUE_DEFAULTS, type StatValuesInput } from "@miku/shared";
import { useEffect, useState } from "react";
import { useGearOptions } from "../api/hooks";
import type { DetailOptions, GearBoard, GearCharacter, GearItemView } from "../api/types";
import { SLOT_ORDER } from "../lib/gear";
import { clickStar, draftOf, fitDraft, isDirty, lineChoices, summary, toggleFlame, withRank } from "../lib/gearDetails";

const Icon = ({ item }: { item: GearItemView | undefined }) => (item?.icon ? <img className="item-icon" src={item.icon} alt="" loading="lazy" /> : <span className="no-icon">no icon</span>);
const rankName = (r: string) => r[0]!.toUpperCase() + r.slice(1);

// Whether a listed item takes nothing at all (stars, flames, potential, hammers).
const takesNothing = (i: GearItemView | undefined) => Boolean(i) && !i!.starMax && !i!.flames && !i!.potential && !i!.hammers;

// Every equipped item as an icon; the picked one is edited below.
export function IconRow({ board, c, items, picked, onPick }: { board: GearBoard; c: GearCharacter; items: Map<string, GearItemView>; picked: string | null; onPick: (slot: string) => void }) {
  const slots = SLOT_ORDER.filter((s) => c.equipped[s]);
  if (slots.length === 0) return <p className="muted small">Nothing equipped yet: pick items in the window first.</p>;
  return (
    <div className="gear-icons" role="group" aria-label="Equipped items">
      {slots.map((slot) => {
        const e = c.equipped[slot]!;
        const item = "item" in e ? items.get(e.item) : undefined;
        const label = item?.name ?? ("other" in e ? e.other : "no longer listed");
        const nothing = takesNothing(item);
        const stars = c.details[slot]?.stars;
        return (
          <button key={slot} type="button" className={`gear-icon${nothing ? " nothing" : ""}`} aria-pressed={picked === slot} aria-label={`${label}${nothing ? " (nothing to set)" : ""}`} title={`${board.slots.find((s) => s.key === slot)?.label}: ${label}`} onClick={() => onPick(slot)}>
            {item ? <Icon item={item} /> : <span className="slot-text">{label}</span>}
            {stars ? <span className="icon-stars">{stars}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// The stars as in the game: 1–15 on top, 16–30 below, each row in three groups of 5.
function Stars({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const group = (from: number) => (
    <div key={from} className="star-group">
      {[0, 1, 2, 3, 4].map((i) => from + i).filter((n) => n <= max).map((n) => (
        <button key={n} type="button" className={`star${n <= value ? " on" : ""}`} aria-label={`${n} stars`} aria-pressed={n <= value} disabled={n < min} onClick={() => onChange(clickStar(value, n, min, max))}>
          ★
        </button>
      ))}
    </div>
  );
  return (
    <div className="stars" role="group" aria-label="Star Force">
      {[1, 16].filter((from) => from <= max).map((from) => (
        <div key={from} className="star-row">
          {[0, 5, 10].map((g) => from + g).filter((n) => n <= max).map(group)}
        </div>
      ))}
    </div>
  );
}

const gainText = (g: DetailOptions["stars"]["gains"][number]) =>
  [["STR", g.str], ["DEX", g.dex], ["INT", g.int], ["LUK", g.luk], ["ATT", g.att], ["Magic ATT", g.matt], ["Max HP", g.hp], ["Max MP", g.mp], ["Speed", g.speed], ["Jump", g.jump]]
    .filter(([, v]) => (v as number) > 0)
    .map(([k, v]) => `${k} +${v}`)
    .join(", ") || "nothing";

// The editor for one equipped item: stars, Exceptional Hammers, potential, flames, Save / Cancel.
// Switching to another item drops unsaved changes (the owner's choice: no "leave without saving?").
export function DetailsEditor({ board, c, slot, items, saving, onSave }: { board: GearBoard; c: GearCharacter; slot: string; items: Map<string, GearItemView>; saving: boolean; onSave: (d: GearDetailsInput) => void }) {
  const e = c.equipped[slot]!;
  const item = "item" in e ? items.get(e.item) : undefined;
  const typed = "other" in e;
  const kind = board.slots.find((s) => s.key === slot)!.kind;
  const saved = c.details[slot];
  const [draft, setDraft] = useState<GearDetailsInput>(() => draftOf(saved, undefined));
  // a typed item's "what it is" (needed before anything else)
  const what = draft.other;
  // a typed weapon needs its attack first (its attack flames are a share of it)
  const needsAttack = kind === "weapon" && what !== undefined && what.att === 0 && what.matt === 0;
  const query = item ? `item=${item.key}` : what && !needsAttack ? `kind=${what.kind}&level=${what.level}&boss=${what.boss ? 1 : 0}&att=${what.att}&matt=${what.matt}` : null;
  const opts = useGearOptions(query);
  const o = opts.data;
  useEffect(() => {
    // a listed item: never below its minimum stars; a typed one: fitted to what it can now have
    if (o) setDraft((d) => (typed ? fitDraft(d, o) : d.stars < o.stars.min ? { ...d, stars: o.stars.min } : d));
  }, [o, typed]);
  const dirty = isDirty(draft, saved, o);
  const set = (change: Partial<GearDetailsInput>) => setDraft((d) => ({ ...d, ...change }));
  const name = item?.name ?? ("other" in e ? e.other : "no longer listed");

  if ("item" in e && !item) return <p className="notice block">This item is no longer in the list, so its details can't be set.</p>;
  if (takesNothing(item)) return <p className="notice block">{name}: nothing to set (it takes no stars, potential, flames or hammers).</p>;

  const head = (
    <div className="details-head">
      <div className="row">
        {item ? <Icon item={item} /> : <span className="no-icon">?</span>}
        <div>
          <h2>{name}</h2>
          <div className="tiny muted">{item ? `Lv. ${item.level ?? "—"}${item.flames === "boss" ? " · boss item" : ""}` : "typed item"}</div>
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={!dirty || !o || saving} onClick={() => onSave(draft)}>
          Save
        </button>
        <button type="button" className="btn ghost" disabled={!dirty} onClick={() => setDraft(draftOf(saved, o))}>
          Cancel
        </button>
        <span className={dirty ? "small gold" : "tiny muted"}>{dirty ? "Unsaved changes" : "Saved"}</span>
      </div>
    </div>
  );

  // A typed item: what it is first.
  const whatBox = typed && (
    <div className="what-box" role="group" aria-label="What the typed item is">
      <span className="small muted">What is it?</span>
      <label className="small">
        Level{" "}
        <input className="text-input count" type="number" min={0} max={300} aria-label="Item level" value={what?.level ?? ""} onChange={(ev) => set({ other: { kind, level: Math.max(0, Math.min(300, Math.floor(Number(ev.target.value) || 0))), boss: what?.boss ?? false, att: what?.att ?? 0, matt: what?.matt ?? 0 } })} />
      </label>
      <label className="small">
        <input type="checkbox" aria-label="Boss item" checked={what?.boss ?? false} disabled={!what} onChange={(ev) => what && set({ other: { ...what, boss: ev.target.checked } })} /> Boss item
      </label>
      {(kind === "weapon" || kind === "gloves") && what && (
        <>
          <label className="small">
            ATT <input className="text-input count" type="number" min={0} aria-label="Weapon attack" value={what.att} onChange={(ev) => set({ other: { ...what, att: Math.max(0, Math.floor(Number(ev.target.value) || 0)) } })} />
          </label>
          <label className="small">
            Magic ATT <input className="text-input count" type="number" min={0} aria-label="Weapon magic attack" value={what.matt} onChange={(ev) => set({ other: { ...what, matt: Math.max(0, Math.floor(Number(ev.target.value) || 0)) } })} />
          </label>
        </>
      )}
    </div>
  );
  if (!o) {
    return (
      <section className="block details" aria-label={`${name} details`}>
        {head}
        {whatBox}
        {typed && !what ? <p className="muted small">Give its level first; then its stars, potential and flames can be set.</p> : needsAttack ? <p className="muted small">Give the weapon's ATT or Magic ATT first: its attack flames are a share of it.</p> : opts.isError ? <p className="error">Couldn't load what this item can have: {opts.error.message}</p> : <p className="muted small">Loading…</p>}
      </section>
    );
  }

  const { min, max } = o.stars;
  const s = summary(item ?? null, o, draft);
  const picked = Object.keys(draft.flames).length;
  const [low, high] = o.flames.length ? [o.flames[0]!.values.findIndex((v) => v !== null) + 1, 7 - [...o.flames[0]!.values].reverse().findIndex((v) => v !== null)] : [0, 0];
  const ranks = POTENTIAL_RANKS.filter((r) => o.potential?.[r]);
  return (
    <section className="block details" aria-label={`${name} details`}>
      {head}
      {whatBox}
      <h3>Star Force</h3>
      {max === 0 ? (
        <p className="muted small">This item can't take stars.</p>
      ) : min === max ? (
        <p className="muted small">{max}★, fixed (can't be enhanced). Adds {gainText(o.stars.gains[max]!)}.</p>
      ) : (
        <>
          <Stars value={draft.stars} min={min} max={max} onChange={(stars) => set({ stars })} />
          <div className="row small">
            <b className="gold">{draft.stars}★</b> / {max}
            <span className="muted">· adds {gainText(o.stars.gains[Math.min(draft.stars, max)]!)}</span>
            {min === 0 && (
              <button type="button" className="btn ghost tight" onClick={() => set({ stars: 0 })}>
                0★
              </button>
            )}
          </div>
          {saved && saved.stars > max && <p className="warning small">Saved with {saved.stars}★, but this item now goes to {max}★.</p>}
          {o.stars.unconfirmedFrom !== null && draft.stars >= o.stars.unconfirmedFrom && <p className="tiny muted">From {o.stars.unconfirmedFrom}★ this weapon's figures aren't confirmed by any source yet.</p>}
        </>
      )}
      {o.hammers && (
        <>
          <h3>Exceptional Enhancement</h3>
          <div className="row">
            <div className="segmented" role="group" aria-label="Exceptional Hammers">
              {Array.from({ length: o.hammers.count + 1 }, (_, n) => (
                <button key={n} type="button" aria-pressed={draft.hammers === n} onClick={() => set({ hammers: n })}>
                  {n}
                </button>
              ))}
            </div>
            <span className="small muted">
              of {o.hammers.count} · each adds All Stats +{o.hammers.per.allStat}, Max HP/MP +{o.hammers.per.hp?.toLocaleString()}, ATT/Magic ATT +{o.hammers.per.att}
            </span>
          </div>
        </>
      )}
      <div className="details-two">
        <div className="details-pot">
          <h3>Potential</h3>
          {!o.potential ? (
            <p className="muted small">This item can't have potential.</p>
          ) : (
            <>
              <label className="small muted">
                Rank{" "}
                <select aria-label="Potential rank" value={draft.potential?.rank ?? ""} onChange={(ev) => set({ potential: ev.target.value ? withRank(draft.potential, ev.target.value as (typeof POTENTIAL_RANKS)[number], o) : null })}>
                  <option value="">None</option>
                  {ranks.map((r) => (
                    <option key={r} value={r}>
                      {rankName(r)}
                    </option>
                  ))}
                </select>
              </label>
              {draft.potential &&
                [0, 1, 2].map((i) => (
                  <label key={i} className="pot-line small">
                    <span className="muted">{i + 1}</span>
                    <select aria-label={`Potential line ${i + 1}`} value={draft.potential!.lines[i] ?? ""} onChange={(ev) => set({ potential: { ...draft.potential!, lines: draft.potential!.lines.map((l, j) => (j === i ? ev.target.value || null : l)) } })}>
                      <option value="">— pick a line —</option>
                      {lineChoices(o, draft.potential!.rank, i).map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </label>
                ))}
            </>
          )}
        </div>
        <div className="tip" aria-label="Item summary">
          <div className="tip-name">
            {name}
            {draft.stars > 0 && max > 0 ? ` (+${draft.stars}★)` : ""}
          </div>
          {s.rows.map((r) => (
            <div key={r.stat} className="tip-line">
              <span>
                {r.stat} +{r.total.toLocaleString()}
              </span>
              <span className="muted">
                ({r.base}
                {r.stars ? <span className="c-stars"> +{r.stars}</span> : null}
                {r.flames ? <span className="c-flames"> +{r.flames}</span> : null}
                {r.hammers ? <span className="c-hammers"> +{r.hammers}</span> : null})
              </span>
            </div>
          ))}
          {s.extras.map((x) => (
            <div key={x}>{x}</div>
          ))}
          {draft.potential && (
            <div className="tip-pot">
              <b className={`rank-${draft.potential.rank}`}>{rankName(draft.potential.rank)} potential</b>
              {draft.potential.lines.filter(Boolean).map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
          <div className="tiny muted">
            base <span className="c-stars">+ stars</span> <span className="c-flames">+ flames</span>
            {o.hammers ? <span className="c-hammers"> + hammers</span> : null}
          </div>
        </div>
      </div>
      <h3>Flames</h3>
      {o.flames.length === 0 ? (
        <p className="muted small">This item can't have flames.</p>
      ) : (
        <>
          <p className="small">
            <b>{picked} / 4</b> <span className="muted">flames picked · tiers {low}–{high}</span>
          </p>
          <div className="flames-scroll">
            <table className="flames">
              <thead>
                <tr>
                  <th>Stat</th>
                  {[1, 2, 3, 4, 5, 6, 7].map((t) => (
                    <th key={t} className={t < low || t > high ? "off" : undefined}>
                      T{t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {o.flames.map((row) => {
                  const on = draft.flames[row.stat];
                  const locked = on === undefined && picked >= 4;
                  return (
                    <tr key={row.stat}>
                      <th scope="row">{row.stat}</th>
                      {row.values.map((v, i) =>
                        v === null ? (
                          <td key={i} className="off" />
                        ) : (
                          <td key={i}>
                            <button type="button" className="flame" aria-label={`${row.stat} tier ${i + 1}: ${v}`} aria-pressed={on === i + 1} disabled={locked} onClick={() => set({ flames: toggleFlame(draft.flames, row.stat, i + 1) })}>
                              {v > 0 && row.stat !== "Req. level" ? "+" : ""}
                              {v.toLocaleString()}
                              {row.stat.endsWith("%") ? "%" : ""}
                            </button>
                          </td>
                        ),
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// What each stat is worth to the character, typed in; saved when you leave a box.
const FIELDS: [keyof StatValuesInput, string, string][] = [
  ["att", "1 ATT =", "main stat"],
  ["allStat", "1% All Stat =", "main stat"],
  ["secRatio", "Secondary stat ratio", ""],
  ["bossDmg", "1% Boss / Damage =", "main stat"],
  ["hp", "1 HP =", "main stat (Demon Avenger)"],
  ["fdPer100", "Final damage per 100 flame score", "%"],
];
function ValueBox({ value, label, onCommit }: { value: number; label: string; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() !== "" && Number.isFinite(n) && n >= 0 && n !== value) onCommit(n);
    else setText(String(value));
  };
  return <input className="text-input count" type="number" step="any" min={0} aria-label={label} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />;
}
export function StatValuesBox({ c, onSave }: { c: GearCharacter; onSave: (v: StatValuesInput) => void }) {
  const v = c.statValues;
  const changed = FIELDS.some(([k]) => v[k] !== STAT_VALUE_DEFAULTS[k]);
  return (
    <div className="stat-values" role="group" aria-label="Stat values">
      <div className="row between">
        <div className="gear-group">Stat values · {c.name}</div>
        <button type="button" className="btn ghost tight" disabled={!changed} onClick={() => onSave({ ...STAT_VALUE_DEFAULTS })}>
          Reset to defaults
        </button>
      </div>
      <p className="tiny muted">What each stat is worth to this character, in main stat. Used for flame scores and final damage later. Get yours from MapleScouter's "Enter Directly" page.</p>
      <div className="value-grid">
        {FIELDS.map(([k, label, unit]) => (
          <label key={k} className="small">
            <span>{label}</span>
            <ValueBox value={v[k]} label={label} onCommit={(n) => onSave({ ...v, [k]: n })} />
            <span className="tiny muted">
              {unit}
              {v[k] !== STAT_VALUE_DEFAULTS[k] && <span className="gold"> (default {STAT_VALUE_DEFAULTS[k]})</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

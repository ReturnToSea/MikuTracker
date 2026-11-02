import { BADGE_SLOTS, FAMILIAR_RANKS, type FamiliarInput, familiarLineFits, type FamiliarRank } from "@miku/shared";
import { useState } from "react";
import { useCharacters, useFamiliars, useSaveFamiliars, useSettings, useUpdateSettings } from "../api/hooks";
import type { FamiliarBoard } from "../api/types";
import { GearTop, NoCharacters, useGearCharacter } from "../components/GearTop";
import { formatTotal, lineKey, lineOfKey, lineText, totalLabel, withBadge, withLine, withRank } from "../lib/familiars";
import { rankName } from "../lib/gearDetails";

type Save = (f: (input: FamiliarInput) => FamiliarInput) => void;
type Line = FamiliarBoard["choices"]["common"]["first"][number];

const Options = ({ lines }: { lines: readonly Line[] }) =>
  lines.map((l) => (
    <option key={lineKey(l)} value={lineKey(l)}>
      {lineText(l)}
    </option>
  ));

// One summoned familiar: its rank (in the rank's colour), its 1st line from the rank's lines, its 2nd from
// the rank below's (usual) or its own (rare).
function Familiar({ b, i, onSave }: { b: FamiliarBoard; i: number; onSave: Save }) {
  const f = b.input.familiars[i]!;
  const choices = b.choices[f.rank];
  const name = `Familiar ${i + 1}`;
  const below = FAMILIAR_RANKS[FAMILIAR_RANKS.indexOf(f.rank) - 1];
  return (
    <div className={`familiar rank-${f.rank}`} role="group" aria-label={name}>
      <div className="familiar-head">
        <b>{name}</b>
        <select aria-label={`${name} rank`} className={`rank-${f.rank}`} value={f.rank} onChange={(e) => onSave((x) => withRank(x, i, e.target.value as FamiliarRank, b.choices[e.target.value as FamiliarRank]))}>
          {FAMILIAR_RANKS.map((r) => (
            <option key={r} value={r}>
              {rankName(r)}
            </option>
          ))}
        </select>
      </div>
      <label className="familiar-line small">
        <span className="muted">Line 1</span>
        <select aria-label={`${name} line 1`} value={lineKey(f.lines[0])} onChange={(e) => onSave((x) => withLine(x, i, 0, lineOfKey(e.target.value)))}>
          <option value="">Not entered</option>
          <Options lines={choices.first} />
          <option value="other">{lineText({ stat: "other", value: 0 })}</option>
        </select>
      </label>
      <label className="familiar-line small">
        <span className="muted">Line 2</span>
        <select aria-label={`${name} line 2`} value={lineKey(f.lines[1])} onChange={(e) => onSave((x) => withLine(x, i, 1, lineOfKey(e.target.value)))}>
          <option value="">Not entered</option>
          {choices.usual && below && (
            <optgroup label={`${rankName(below)} (usual)`}>
              <Options lines={choices.usual} />
            </optgroup>
          )}
          <optgroup label={`${rankName(f.rank)}${choices.usual ? " (rare)" : ""}`}>
            <Options lines={choices.rare} />
          </optgroup>
          <option value="other">{lineText({ stat: "other", value: 0 })}</option>
        </select>
      </label>
      {/* (a saved line the rank can't have can't happen: the server refuses it; shown only while a change is saved) */}
      {!f.lines.every((l, slot) => familiarLineFits(l, slot as 0 | 1, choices)) && <p className="tiny error">A line doesn't fit this rank.</p>}
    </div>
  );
}

function Familiars({ b, onSave }: { b: FamiliarBoard; onSave: Save }) {
  return (
    <section className="block" aria-label="Familiars">
      <div className="page-head">
        <h2>Familiars</h2>
        <span className="tiny muted">The 2nd line usually comes from the rank below</span>
      </div>
      <div className="familiars">
        {[0, 1, 2].map((i) => (
          <Familiar key={i} b={b} i={i} onSave={onSave} />
        ))}
      </div>
    </section>
  );
}

// Every badge with its picture and what it gives, ticked when equipped (8 at most: the rest can't be ticked
// until one is taken off).
function Badges({ b, onSave }: { b: FamiliarBoard; onSave: Save }) {
  const [damageOnly, setDamageOnly] = useState(false);
  const equipped = new Set(b.input.badges);
  const full = equipped.size >= BADGE_SLOTS;
  const shown = b.badges.filter((x) => !damageOnly || x.damage);
  return (
    <section className="block" aria-label="Badges">
      <div className="page-head">
        <h2>Badges</h2>
        <span className="familiar-tools small muted">
          <span>
            Equipped{" "}
            <b className={full ? "accent" : ""}>
              {equipped.size} / {BADGE_SLOTS}
            </b>
          </span>
          <label>
            <input type="checkbox" checked={damageOnly} onChange={(e) => setDamageOnly(e.target.checked)} /> Damage badges only
          </label>
          <button type="button" className="link-button" disabled={equipped.size === 0} onClick={() => onSave((x) => ({ ...x, badges: [] }))}>
            Untick all
          </button>
        </span>
      </div>
      <div className="fam-badges">
        {shown.map((x) => {
          const on = equipped.has(x.id);
          return (
            <label key={x.id} className={`fam-badge${on ? " on" : ""}${full && !on ? " off" : ""}`} title={full && !on ? `${BADGE_SLOTS} badges equipped: untick one first` : undefined}>
              <input type="checkbox" checked={on} disabled={full && !on} onChange={(e) => onSave((i) => withBadge(i, x.id, e.target.checked))} />
              {x.icon ? <img className="fam-badge-icon" src={x.icon} alt="" /> : <span className="fam-badge-icon none">{x.name[0]}</span>}
              <span>
                <b>{x.name.replace(/ Badge$/, "")}</b>
                {x.effects.map((e) => (
                  <span key={e} className="tiny muted fam-badge-effect">
                    {e}
                  </span>
                ))}
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

// What the lines and badges add up to, per stat (the familiar Boss DMG cap shown when it's passed).
function Totals({ b }: { b: FamiliarBoard }) {
  return (
    <section className="block familiar-side" aria-label="Totals">
      <div className="page-head">
        <h2>Totals</h2>
      </div>
      {b.totals.length === 0 ? (
        <p className="notice muted">Nothing entered yet.</p>
      ) : (
        <table className="familiar-totals">
          <thead>
            <tr>
              <th>Stat</th>
              <th>Familiars</th>
              <th>Badges</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {b.totals.map((t) => (
              <tr key={t.stat}>
                <td>{totalLabel(t.stat)}</td>
                <td>{formatTotal(t.stat, t.familiars)}</td>
                <td>{formatTotal(t.stat, t.badges)}</td>
                <td>
                  <b>{formatTotal(t.stat, t.total)}</b>
                  {t.over !== null && (
                    <span className="familiar-over tiny" title={`The lines add up to ${formatTotal(t.stat, t.over)}; only ${b.bossCap}% counts`}>
                      {formatTotal(t.stat, t.over)} → {b.bossCap}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="tiny muted">IED combines rather than adds. Familiar Boss DMG counts up to {b.bossCap}%. These go into the stat sheet later (v4); no final damage yet. {b.source}.</p>
    </section>
  );
}

// The Familiars page (v3.2.0): a character's summoned familiars and equipped badges, and what they add up to.
export function FamiliarsPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  // (the tabs: the world's characters, as Home lists them)
  const tabs = useCharacters(world);
  const [picked, setPicked] = useGearCharacter();
  const list = tabs.data?.characters;
  const c = list?.find((x) => x.id === picked) ?? list?.[0];
  const board = useFamiliars(c?.id);
  const save = useSaveFamiliars(c?.id);
  const b = board.data;
  return (
    <div className="familiar-page">
      <h1 className="visually-hidden">Familiars</h1>
      <GearTop world={world} onWorld={(w) => saveSettings.mutate({ worldId: w })} characters={list} current={c} onPick={setPicked} />
      {(tabs.isError || board.isError || save.error) && (
        <p className="error block" role="alert">
          {(tabs.error ?? board.error ?? save.error)!.message}
        </p>
      )}
      {(tabs.isPending || (c && board.isPending)) && <p className="notice muted block">Loading…</p>}
      {list?.length === 0 && <NoCharacters world={world} />}
      {c && b && (
        <div className="familiar-split">
          <div>
            <Familiars b={b} onSave={save.change} />
            <Badges b={b} onSave={save.change} />
          </div>
          <Totals b={b} />
        </div>
      )}
    </div>
  );
}

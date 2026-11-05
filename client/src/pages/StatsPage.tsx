import { COMBAT_ORDERS, HEXA_LEVEL_MAX, INNER_ABILITY, LEVEL_MAX, STAT_BUFFS, STAT_BUFFS_A, STAT_BUFFS_B, STAT_EVENT_BUFFS, STAT_LINKS, type StatsInput, type StatsTryInput } from "@miku/shared";
import { createContext, useContext, useEffect, useState } from "react";
import { useCharacters, useRefreshStatus, useSaveStats, useSettings, useStats, useStatsTry, useUpdateSettings } from "../api/hooks";
import type { StatsBoard } from "../api/types";
import { GearTop, NoCharacters, useGearCharacter } from "../components/GearTop";
import {
  BUFF_NAMES, efficiencyRows, formatHp, formatLoss, formatPct, formatRate, formatWhole, GUILD_NAMES, iconId, keepTest, LINK_NAMES, loadTest, relevant, RENOWN_NAMES, RINGS, scoreChange, shortOf, shownFor, testFrom, toneOf, UNCOUNTED_BUFFS, valueAt, withPick, withValue,
} from "../lib/stats";

type Save = (f: (input: StatsInput) => StatsInput) => void;
// While testing (v4.1.0): the saved sheet, so a box that differs is outlined (null: not testing).
const Saved = createContext<StatsInput | null>(null);

// A number typed in a box: saved on Enter or leaving the box (kept within its range; whole numbers only where
// the game has them); anything else goes back. While testing, outlined when it differs from what's saved
// (`was`), which hovering shows.
function NumBox({ value, label, max, whole = false, min = 0, was, onCommit }: { value: number; label: string; max: number; whole?: boolean; min?: number; was?: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    const ok = text.trim() !== "" && Number.isFinite(n);
    const kept = Math.min(max, Math.max(min, whole ? Math.round(n) : n));
    if (ok && kept !== value) onCommit(kept);
    setText(String(ok ? kept : value));
  };
  const changed = was !== undefined && was !== value;
  return (
    <input
      className={`text-input stp-num${changed ? " stp-changed" : ""}`}
      inputMode="decimal"
      aria-label={label}
      title={changed ? `Saved: ${was}` : undefined}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
// A picture (its first letter when it isn't downloaded).
const Pic = ({ src, name }: { src: string | null | undefined; name: string }) => (src ? <img className="stp-pic" src={src} alt="" /> : <span className="stp-pic none">{name[0]}</span>);

// A box of the sheet at a path, against what's saved while testing.
function SheetBox({ b, path, label, max, whole, onSave }: { b: StatsBoard; path: string; label: string; max: number; whole?: boolean; onSave: Save }) {
  const saved = useContext(Saved);
  return <NumBox value={valueAt(b.input, path) as number} label={label} max={max} whole={whole} was={saved ? (valueAt(saved, path) as number) : undefined} onCommit={(v) => onSave((i) => withValue(i, path, v))} />;
}
// A box that's typed: its name and the number.
function Field({ b, label, path, max, whole, onSave }: { b: StatsBoard; label: string; path: string; max: number; whole?: boolean; onSave: Save }) {
  return (
    <div className="stp-field">
      <span>{label}</span>
      <SheetBox b={b} path={path} label={label} max={max} whole={whole} onSave={onSave} />
    </div>
  );
}
// A box worked out elsewhere: its name and the number, not typed.
const Shown = ({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) => (
  <div className={`stp-field${muted ? " muted" : ""}`} role="group" aria-label={label}>
    <span>{label}</span>
    <b>{value}</b>
  </div>
);

// The score, and MapleScouter's "Normal" (every HEXA core at 30) beside it; while testing, the saved score
// and the change.
function Score({ b, saved, testing, onTesting }: { b: StatsBoard; saved: StatsBoard; testing: boolean; onTesting: (on: boolean) => void }) {
  const change = scoreChange(saved.out.score380, b.out.score380);
  return (
    <section className="block" aria-label="Score">
      <div className="page-head">
        <h2>Score</h2>
        <label className="small">
          <input type="checkbox" checked={testing} onChange={(e) => onTesting(e.target.checked)} /> Testing
        </label>
      </div>
      <div className="stp-scores">
        {(
          [
            ["vs 380% defense", b.out.score380, b.out.normal380],
            ["vs 300% defense", b.out.score300, b.out.normal300],
          ] as const
        ).map(([label, score, normal]) => (
          <div key={label}>
            <div className="hexa-label">{label}</div>
            <b>{formatWhole(score)}</b>
            <div className="tiny muted">every core at 30: {formatWhole(normal)}</div>
          </div>
        ))}
      </div>
      {testing && change !== null && (
        <p className="stp-change small" aria-label="Change from saved">
          {formatWhole(saved.out.score380)} → {formatWhole(b.out.score380)} ({change})
        </p>
      )}
    </section>
  );
}

// The game's Stats window, as typed, and the boxes worked out from it.
function StatsWindow({ b, onSave, test }: { b: StatsBoard; onSave: Save; test: { level: number; was: number; onLevel: (n: number) => void } | null }) {
  const i = b.input;
  const rows = [
    ["main", b.labels.main],
    ["sub", b.labels.sub],
    ...(b.labels.third ? [["third", b.labels.third]] : []),
    ["atk", b.labels.atk],
  ] as [keyof StatsInput["stats"], string][];
  const f = (label: string, key: keyof StatsInput["stats"], max: number, whole = false) => <Field b={b} label={label} path={`stats.${key}`} max={max} whole={whole} onSave={onSave} />;
  return (
    <section className="block" aria-label="Character Stats">
      <div className="page-head">
        <h2>Character Stats</h2>
      </div>
      <div className="stp-pair">
        {test ? (
          <div className="stp-field">
            <span>Level</span>
            <NumBox value={test.level} label="Level" min={1} max={LEVEL_MAX} whole was={test.was} onCommit={test.onLevel} />
          </div>
        ) : (
          <Shown label="Level" value={String(b.level)} />
        )}
        <Shown label="World" value={b.heroic ? "Heroic" : "Interactive"} />
      </div>
      <div className="stp-ticks small">
        <label>
          <input type="checkbox" checked={i.liberation} onChange={(e) => onSave((x) => ({ ...x, liberation: e.target.checked }))} /> Liberation
        </label>
        <label>
          Combat Orders{" "}
          <select value={i.combatOrders} onChange={(e) => onSave((x) => ({ ...x, combatOrders: e.target.value as StatsInput["combatOrders"] }))}>
            {COMBAT_ORDERS.map((c) => (
              <option key={c} value={c}>
                {{ none: "None", decent: "Decent", real: "Paladin's" }[c]}
              </option>
            ))}
          </select>
        </label>
        {b.options.ruinShield && (
          <label>
            <input type="checkbox" checked={i.ruinShield} onChange={(e) => onSave((x) => ({ ...x, ruinShield: e.target.checked }))} /> Ruin Force Shield
          </label>
        )}
        {b.options.oneHanded && (
          <label>
            <input type="checkbox" checked={i.oneHanded} onChange={(e) => onSave((x) => ({ ...x, oneHanded: e.target.checked }))} /> One-handed weapon
          </label>
        )}
      </div>
      <table className="stp-triples">
        <thead>
          <tr>
            <th />
            <th>Base Value</th>
            <th>% Value</th>
            <th>% Value Not Applied</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, label]) => (
            <tr key={key}>
              <th>{label}</th>
              {(["base", "per", "abs"] as const).map((part) => (
                <td key={part}>
                  <SheetBox b={b} path={`stats.${key}.${part}`} label={`${label} ${{ base: "base", per: "%", abs: "% not applied" }[part]}`} max={part === "per" ? 100_000 : 10_000_000} whole={part !== "per"} onSave={onSave} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="stp-pair">
        {(["main", "sub", ...(b.labels.third ? ["third"] : [])] as (keyof StatsInput["famPct"])[]).map((k) => (
          <Field key={k} b={b} label={`Familiars: ${b.labels[k]} %`} path={`famPct.${k}`} max={1_000} onSave={onSave} />
        ))}
      </div>
      <div className="stp-grid">
        <Shown label="General Range" value={formatWhole(b.out.generalRange)} />
        {f("Damage", "dmg", 100_000)}
        <Shown label="Final Damage" value={formatPct(b.out.finalDamage)} />
        {f("Boss Damage", "boss", 100_000)}
        {f("Ignore Enemy Defense", "ied", 100)}
        <Shown label="Normal Enemy Damage" value="—" muted />
        <Shown label="Attack" value={formatWhole(b.out.atkTotal)} />
        {f("Critical Rate", "critRate", 1_000)}
        <Shown label="M.Attack" value={formatWhole(b.out.atkTotal)} />
        {f("Critical Damage", "critDmg", 10_000)}
        <div className="stp-field">
          <span>Cooldown Reduction</span>
          <span className="stp-cd">
            <SheetBox b={b} path="stats.cdSec" label="Cooldown Reduction seconds" max={100} onSave={onSave} /> s
            <SheetBox b={b} path="stats.cdPct" label="Cooldown Reduction %" max={100} onSave={onSave} /> %
          </span>
        </div>
        {f("Buff Duration", "buffDuration", 10_000)}
        {f("Cooldown Skip", "cdSkip", 100)}
        {f("Ignore Elemental Resistance", "elemResist", 100)}
        {f("Additional Status Damage", "statusDmg", 10_000)}
        {f("Summon Duration", "summon", 10_000)}
        {f("Arcane Force", "arcane", 100_000, true)}
        {f("Sacred Force", "sacred", 100_000, true)}
      </div>
    </section>
  );
}

// A buff's tile: its picture and name, lit when it's on.
// (`was`: while testing, whether it was on when saved; a buff whose effect isn't known yet says so)
function Tile({ b, id, on, onClick, children, disabled = false, was }: { b: StatsBoard; id: string; on: boolean; onClick?: () => void; children?: React.ReactNode; disabled?: boolean; was?: boolean }) {
  const name = BUFF_NAMES[id] ?? GUILD_NAMES[id as keyof typeof GUILD_NAMES] ?? LINK_NAMES[id as keyof typeof LINK_NAMES] ?? id;
  const pic = <Pic src={b.icons[iconId(id)]} name={name} />;
  const changed = was !== undefined && was !== on;
  return (
    <div className={`stp-tile${on ? " on" : ""}${disabled ? " off" : ""}${changed ? " stp-changed" : ""}`} title={UNCOUNTED_BUFFS.includes(id) ? `${name}: what it gives isn't known yet, so it counts nothing` : name}>
      {onClick ? (
        <button type="button" aria-pressed={on} aria-label={name} disabled={disabled} onClick={onClick}>
          {pic}
        </button>
      ) : (
        pic
      )}
      {children}
      <small>{name}</small>
    </div>
  );
}

function Buffs({ b, onSave }: { b: StatsBoard; onSave: Save }) {
  const i = b.input;
  const saved = useContext(Saved);
  const level = (path: string, label: string, max: number) => <SheetBox b={b} path={path} label={label} max={max} whole onSave={onSave} />;
  const main = b.labels.main;
  return (
    <section className="block" aria-label="Buffs">
      <div className="page-head">
        <h2>Buffs</h2>
      </div>
      <div className="stp-tiles">
        <Tile b={b} id={`statPotion${main}`} on={i.statPotion} was={saved?.statPotion} onClick={() => onSave((x) => ({ ...x, statPotion: !x.statPotion }))} />
        {STAT_BUFFS.map((k) => (
          <Tile key={k} b={b} id={k} on={i.buffs[k]} was={saved?.buffs[k]} onClick={() => onSave((x) => ({ ...x, buffs: { ...x.buffs, [k]: !x.buffs[k] } }))} />
        ))}
        <Tile b={b} id="sacredSymbols" on={b.sacred}>
          <span className="tiny muted" title="Every Sacred symbol maxed (the Symbols page): +20% damage against 380% bosses">{b.sacred ? "all maxed" : "not all maxed"}</span>
        </Tile>
      </div>
      <h3 className="stp-sub">One of these</h3>
      <div className="stp-tiles">
        {STAT_BUFFS_A.map((k) => (
          <Tile key={k} b={b} id={k} on={i.buffA === k} was={saved ? saved.buffA === k : undefined} onClick={() => onSave((x) => withPick(x, "buffA", k))} />
        ))}
      </div>
      <h3 className="stp-sub">One of these</h3>
      <div className="stp-tiles">
        {STAT_BUFFS_B.filter((k) => shownFor(k, b.options.magic)).map((k) => (
          <Tile key={k} b={b} id={k} on={i.buffB === k} was={saved ? saved.buffB === k : undefined} onClick={() => onSave((x) => withPick(x, "buffB", k))} />
        ))}
      </div>
      <h3 className="stp-sub">Guild and Champion's Renown</h3>
      <div className="stp-tiles">
        {(Object.keys(GUILD_NAMES) as (keyof StatsInput["guild"])[]).map((k) => (
          <Tile key={k} b={b} id={k} on={i.guild[k] > 0}>
            {level(`guild.${k}`, GUILD_NAMES[k], 15)}
          </Tile>
        ))}
        {(Object.keys(RENOWN_NAMES) as (keyof StatsInput["renown"])[]).map((k) => (
          <div key={k} className={`stp-tile${i.renown[k] > 0 ? " on" : ""}`} title={RENOWN_NAMES[k]}>
            <Pic src={b.icons.renown} name={RENOWN_NAMES[k]} />
            {level(`renown.${k}`, RENOWN_NAMES[k], 5)}
            <small>{RENOWN_NAMES[k]}</small>
          </div>
        ))}
      </div>
      <div className="page-head stp-event-head">
        <h2>Event stats</h2>
        <label className="small">
          <input type="checkbox" checked={i.eventOn} onChange={(e) => onSave((x) => ({ ...x, eventOn: e.target.checked }))} /> On
        </label>
      </div>
      <div className={i.eventOn ? "" : "stp-dim"}>
        <div className="stp-tiles">
          {STAT_EVENT_BUFFS.map((k) => (
            <Tile key={k} b={b} id={k} on={i.eventOn && i.events[k]} was={saved ? saved.eventOn && saved.events[k] : undefined} disabled={!i.eventOn} onClick={() => onSave((x) => ({ ...x, events: { ...x.events, [k]: !x.events[k] } }))} />
          ))}
        </div>
        <div className="stp-grid">
          <Field b={b} label="Event ATT" path="eventStats.att" max={100_000} onSave={onSave} />
          <Field b={b} label="Event Damage %" path="eventStats.dmg" max={10_000} onSave={onSave} />
          <Field b={b} label="Event Boss Damage %" path="eventStats.boss" max={10_000} onSave={onSave} />
          <Field b={b} label="Event IED %" path="eventStats.ied" max={100} onSave={onSave} />
          <Field b={b} label="Event Crit Damage %" path="eventStats.critDmg" max={10_000} onSave={onSave} />
          <Field b={b} label="Event All Stats" path="eventStats.allStat" max={100_000} onSave={onSave} />
          <Field b={b} label="Event Arcane Power" path="eventStats.arcane" max={100_000} whole onSave={onSave} />
          <Field b={b} label="Event Sacred Power" path="eventStats.sacred" max={100_000} whole onSave={onSave} />
        </div>
      </div>
    </section>
  );
}

function Links({ b, onSave }: { b: StatsBoard; onSave: Save }) {
  return (
    <section className="block" aria-label="Links / Legion">
      <div className="page-head">
        <h2>Links / Legion</h2>
      </div>
      <div className="stp-tiles">
        {(Object.keys(STAT_LINKS) as (keyof typeof STAT_LINKS)[]).map((k) => (
          <Tile key={k} b={b} id={k} on={b.input.links[k] > 0}>
            <SheetBox b={b} path={`links.${k}`} label={LINK_NAMES[k]} max={STAT_LINKS[k]} whole onSave={onSave} />
          </Tile>
        ))}
      </div>
      <Field b={b} label="Wild Hunter Legion" path="wildHunter" max={1_000} whole onSave={onSave} />
    </section>
  );
}

// HEXA (from the HEXA page), the Artifact, the Inner Ability line and the Oz Rings.
function Rest({ b, onSave, test }: { b: StatsBoard; onSave: Save; test: { hexa: StatsTryInput["hexa"]; was: StatsBoard["hexa"]; onHexa: (node: string, n: number) => void } | null }) {
  const i = b.input;
  return (
    <section className="block" aria-label="HEXA, Artifact, Inner Ability and Oz Rings">
      <h3 className="stp-sub">HEXA Enhancement</h3>
      <div className="stp-tiles">
        {b.hexa.map((n) => (
          <div key={n.node} className="stp-tile" title={n.name}>
            <Pic src={n.icon} name={n.name} />
            {test ? <NumBox value={test.hexa[n.node]} label={n.name} max={HEXA_LEVEL_MAX} whole was={test.was.find((x) => x.node === n.node)?.level} onCommit={(v) => test.onHexa(n.node, v)} /> : <b>{n.level}</b>}
          </div>
        ))}
      </div>
      <div className="stp-pair">
        <div>
          <h3 className="stp-sub">Legion Artifact</h3>
          <label className="small" title="Doesn't change the score (MapleScouter's damage doesn't count it)">
            <input type="checkbox" checked={i.artifact.extraTarget} onChange={(e) => onSave((x) => ({ ...x, artifact: { ...x.artifact, extraTarget: e.target.checked } }))} /> Additional EXP (+1 Mob Targeted)
          </label>
          <Field b={b} label="Final Attack" path="artifact.finalAttack" max={1_000} onSave={onSave} />
        </div>
        <div>
          <h3 className="stp-sub">Special Inner Ability</h3>
          {INNER_ABILITY.map((k) => (
            <label key={k} className="small stp-radio" title={k === "target" ? "Doesn't change the score (MapleScouter's damage doesn't count it)" : undefined}>
              <input type="radio" name="inner-ability" checked={i.innerAbility === k} onChange={() => onSave((x) => ({ ...x, innerAbility: k }))} /> {{ none: "None", passive: "Passive Skills +1", target: "+1 Mob Targeted" }[k]}
            </label>
          ))}
        </div>
      </div>
      <h3 className="stp-sub">Oz Ring</h3>
      <div className="stp-tiles">
        {RINGS.map(([k, name]) => {
          return (
            <div key={k} className={`stp-tile${i.rings[k] > 0 ? " on" : ""}`} title={k === "weapon" ? `${name}: doesn't change the score (MapleScouter's damage doesn't count it)` : name}>
              <Pic src={b.rings[k]} name={name} />
              <SheetBox b={b} path={`rings.${k}`} label={name} max={6} whole onSave={onSave} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── v4.1.0: the boss clears and stat efficiency ───────────────────────────────────────────────
type Boss = StatsBoard["bosses"][number];
const GAP_NAMES = { level: "Level", arcane: "Arcane Force", sacred: "Sacred Force" } as const;

// A boss's tile: its picture (with "Lvl" or "F" when short of full damage), tag, clear % and the score it
// sees against the score that clears it; hovering gives the damage lost.
function BossTile({ x, picked, onPick }: { x: Boss; picked: boolean; onPick: () => void }) {
  const level = x.gaps.find((g) => g.kind === "level")!;
  const forces = x.gaps.filter((g) => g.kind !== "level").map(shortOf).filter((t) => t !== null);
  const lost = [...x.gaps.map((g) => `${GAP_NAMES[g.kind]}: ${formatLoss(g.loss)}`), `Combined: ${formatLoss(x.loss)}`].join("\n");
  const mode = x.difficulty === "Champion" ? " champion" : x.difficulty === "Destiny" ? " destiny" : "";
  return (
    <button type="button" className={`bc-tile${mode}`} aria-pressed={picked} aria-label={`${x.difficulty} ${x.name}`} title={`${x.difficulty} ${x.name}\n${lost}`} onClick={onPick}>
      <span className="bc-pic">
        {x.icon ? <img src={x.icon} alt="" /> : <span className="stp-pic none">{x.name[0]}</span>}
        <span className="bc-badges">
          {shortOf(level) && (
            <span className="bc-badge" title={`For full damage: ${shortOf(level)}`}>
              Lvl
            </span>
          )}
          {forces.length > 0 && (
            <span className="bc-badge" title={`For full damage:\n${forces.join("\n")}`}>
              F
            </span>
          )}
        </span>
      </span>
      <span className={`bc-tag tone-${toneOf(x.tag)}`}>{x.tag}</span>
      <b className={`tone-${toneOf(x.tag)}`}>{formatRate(x.shown)}</b>
      <small className="muted">
        {formatWhole(x.bossStat)}
        <br />/ {formatWhole(x.need)}
      </small>
    </button>
  );
}

// The picked boss: its tag and clear %, its HP by phase (each phase's HP bars, or the monsters fought at
// once), and the damage lost to each gap.
function BossPanel({ x }: { x: Boss }) {
  const sum = (xs: number[]) => xs.reduce((a, v) => a + v, 0);
  return (
    <section className="block bc-panel" aria-label="Boss details">
      <div className="bc-top">
        {x.icon ? <img src={x.icon} alt="" /> : <span className="stp-pic none">{x.name[0]}</span>}
        <div>
          <h2>
            {x.difficulty} {x.name}
          </h2>
          <span className={`bc-tag tone-${toneOf(x.tag)}`}>{x.tag}</span> <b className={`bc-rate tone-${toneOf(x.tag)}`}>{formatRate(x.shown)}</b>
          <div className="small muted">
            {formatWhole(x.bossStat)} / {formatWhole(x.need)} needed
          </div>
        </div>
      </div>
      <h3 className="stp-sub">HP</h3>
      {x.phases ? (
        <>
          {x.phases.map((p, i) => (
            <div key={p.name} className="bc-phase">
              <div className="row between small">
                <span>{p.name}</span>
                <b>{formatHp(sum(p.hp))}</b>
              </div>
              <div className={`bc-bar part-${i % 4}`}>
                {p.hp.map((hp, j) => (
                  <i key={j} style={{ flexGrow: hp }} title={formatHp(hp)}>
                    {p.hp.length > 1 ? formatHp(hp) : ""}
                  </i>
                ))}
              </div>
            </div>
          ))}
          <p className="tiny muted">
            Total {formatHp(sum(x.phases.flatMap((p) => p.hp)))} · KMS figures (MapleScouter){x.difficulty === "Champion" ? " · the same HP as the difficulty it's built on" : ""}
          </p>
        </>
      ) : (
        <p className="small muted">Not known</p>
      )}
      <h3 className="stp-sub">Damage lost</h3>
      <table className="bc-gaps small">
        <tbody>
          {x.gaps.map((g) => (
            <tr key={g.kind}>
              <td>{GAP_NAMES[g.kind]}</td>
              <td>
                {g.you.toLocaleString("en-US")} / {g.full.toLocaleString("en-US")}
              </td>
              <td className={g.loss > 0.0005 ? "warn" : "muted"}>{formatLoss(g.loss)}</td>
            </tr>
          ))}
          <tr>
            <th>Combined</th>
            <td />
            <th className={x.loss > 0.0005 ? "warn" : "muted"}>{formatLoss(x.loss)}</th>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function BossClear({ b }: { b: StatsBoard }) {
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const list = all ? b.bosses : b.bosses.filter(relevant);
  const shown = list.find((x) => x.key === picked) ?? list[0];
  return (
    <div className="bc-wrap">
      <section className="block" aria-label="Boss clear">
        <div className="page-head">
          <h2>Boss clear</h2>
          <label className="small">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all ({b.bosses.length})
          </label>
        </div>
        {list.length === 0 ? (
          <p className="small muted">No boss in range</p>
        ) : (
          <div className="bc-grid">
            {list.map((x) => (
              <BossTile key={x.key} x={x} picked={x === shown} onPick={() => setPicked(x.key)} />
            ))}
          </div>
        )}
      </section>
      {shown && <BossPanel x={shown} />}
    </div>
  );
}

// Stat efficiency: each stat in main stat (MapleScouter's "Detail Eff."), with an amount to work out.
function Efficiency({ b }: { b: StatsBoard }) {
  // (by the stat's name: rows differ by job)
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const e = b.efficiency;
  if (!e) return <p className="notice muted block">Not worked out for this sheet</p>;
  const main = b.labels.main;
  return (
    <section className="block" aria-label="Stat efficiency">
      <div className="page-head">
        <h2>Stat efficiency</h2>
        <span className="tiny muted">in {main}</span>
      </div>
      <table className="bc-eff">
        <thead>
          <tr>
            <th>Stat</th>
            <th className="num">= {main}</th>
            <th>Amount</th>
            <th className="num">= {main}</th>
          </tr>
        </thead>
        <tbody>
          {efficiencyRows(e, b.labels).map((r) => {
            const k = `${r.pct ? "%" : ""}${r.label}`;
            const amount = Number(amounts[k] ?? "1");
            return (
              <tr key={k}>
                <td>
                  1{r.pct ? "%" : ""} {r.label}
                </td>
                <td className="num">
                  <b>{r.value.toFixed(2)}</b>
                </td>
                <td>
                  <input className="text-input stp-num" inputMode="decimal" aria-label={`Amount of ${r.label}${r.pct ? " %" : ""}`} value={amounts[k] ?? "1"} onChange={(ev) => setAmounts({ ...amounts, [k]: ev.target.value })} />
                  {r.pct ? " %" : ""}
                </td>
                <td className="num">{Number.isFinite(amount) ? (amount * r.value).toFixed(2) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="stp-pair">
        <div>
          <h3 className="stp-sub">Final damage</h3>
          <table className="bc-eff">
            <tbody>
              <tr>
                <td>100 {main}</td>
                <td className="num">
                  <b>{e.fdPer100.toFixed(3)}%</b>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="stp-sub">Skill cooldown</h3>
          <table className="bc-eff">
            <tbody>
              {Object.entries(e.cooldown).map(([sec, fd]) => (
                <tr key={sec}>
                  <td>{sec} s more</td>
                  <td className="num">
                    <b>{fd.toFixed(2)}%</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// The Stats page (v4.0.0): a character's Stats window and the rest, like MapleScouter's Enter Directly page,
// with its score. From v4.1.0: three views (the sheet, the boss clears, stat efficiency) and test mode: the
// sheet, level and HEXA levels changed freely, nothing saved, kept in this browser until the test ends.
export function StatsPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  useRefreshStatus(); // after each check of Nexon, the level and so the score are worked out again
  // (the tabs: the world's characters, as Home lists them)
  const tabs = useCharacters(world);
  const [picked, setPicked] = useGearCharacter();
  const list = tabs.data?.characters;
  const c = list?.find((x) => x.id === picked) ?? list?.[0];
  const board = useStats(c?.id);
  const save = useSaveStats(c?.id);
  const [view, setView] = useState<"sheet" | "boss" | "eff">("sheet");
  // test mode: this character's test, if one is going on
  const [test, setTest] = useState<{ id: number; t: StatsTryInput } | null>(null);
  useEffect(() => {
    const t = c ? loadTest(c.id) : null;
    setTest(c && t ? { id: c.id, t } : null);
  }, [c?.id]);
  const t = test && test.id === c?.id ? test.t : null;
  const tried = useStatsTry(c?.id, t);
  const saved = board.data;
  const changeTest = (next: StatsTryInput | null) => {
    keepTest(c!.id, next);
    setTest(next ? { id: c!.id, t: next } : null);
  };
  // (while testing: the test's numbers, its own boxes shown at once while the numbers come)
  const b = saved && t ? { ...(tried.data ?? saved), input: t.input, level: t.level } : saved;
  const onSave: Save = t ? (f) => changeTest({ ...t, input: f(t.input) }) : save.change;
  return (
    <div className="stp-page">
      <h1 className="visually-hidden">Stats</h1>
      <GearTop world={world} onWorld={(w) => saveSettings.mutate({ worldId: w })} characters={list} current={c} onPick={setPicked} />
      {(tabs.isError || board.isError || save.error || tried.isError) && (
        <p className="error block" role="alert">
          {(tabs.error ?? board.error ?? save.error ?? tried.error)!.message}
        </p>
      )}
      {(tabs.isPending || (c && board.isPending)) && <p className="notice muted block">Loading…</p>}
      {list?.length === 0 && <NoCharacters world={world} />}
      {c && b && !b.known && <p className="notice block">{b.shine ? `${c.job} is a SHINE class: its Erda Link isn't tracked yet, so its stats aren't worked out.` : `Stats for ${c.job} aren't in the figures yet.`}</p>}
      {c && b && saved && b.known && (
        <Saved.Provider value={t ? saved.input : null}>
          <Score b={b} saved={saved} testing={t !== null} onTesting={(on) => changeTest(on ? testFrom(saved) : null)} />
          <div className="segmented stp-views" role="group" aria-label="View">
            {(
              [
                ["sheet", "Stats sheet"],
                ["boss", "Boss clear"],
                ["eff", "Efficiency"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
                {label}
              </button>
            ))}
          </div>
          {t && (
            <div className="stp-testbar small" role="status">
              <span>
                <b>Testing</b>: nothing is saved; changed boxes are outlined.
              </span>
              <button type="button" className="btn ghost tight" onClick={() => changeTest(testFrom(saved))}>
                Reset to saved
              </button>
            </div>
          )}
          {view === "sheet" && (
            <div className="stp-split">
              <StatsWindow b={b} onSave={onSave} test={t && { level: t.level, was: saved.level, onLevel: (n) => changeTest({ ...t, level: n }) }} />
              <div>
                <Buffs b={b} onSave={onSave} />
                <Links b={b} onSave={onSave} />
                <Rest b={b} onSave={onSave} test={t && { hexa: t.hexa, was: saved.hexa, onHexa: (node, n) => changeTest({ ...t, hexa: { ...t.hexa, [node]: n } }) }} />
              </div>
            </div>
          )}
          {view === "boss" && <BossClear b={b} />}
          {/* (each character's own amounts) */}
          {view === "eff" && <Efficiency key={c.id} b={b} />}
        </Saved.Provider>
      )}
    </div>
  );
}

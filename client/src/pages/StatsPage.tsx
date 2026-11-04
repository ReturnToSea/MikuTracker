import { COMBAT_ORDERS, INNER_ABILITY, STAT_BUFFS, STAT_BUFFS_A, STAT_BUFFS_B, STAT_EVENT_BUFFS, STAT_LINKS, type StatsInput } from "@miku/shared";
import { useEffect, useState } from "react";
import { useCharacters, useRefreshStatus, useSaveStats, useSettings, useStats, useUpdateSettings } from "../api/hooks";
import type { StatsBoard } from "../api/types";
import { GearTop, NoCharacters, useGearCharacter } from "../components/GearTop";
import { BUFF_NAMES, formatPct, formatWhole, GUILD_NAMES, iconId, LINK_NAMES, RENOWN_NAMES, shownFor, withPick, withValue } from "../lib/stats";

type Save = (f: (input: StatsInput) => StatsInput) => void;

// A number typed in a box: saved on Enter or leaving the box (kept within its range; whole numbers only where
// the game has them); anything else goes back.
function NumBox({ value, label, max, whole = false, onCommit }: { value: number; label: string; max: number; whole?: boolean; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    const ok = text.trim() !== "" && Number.isFinite(n);
    const kept = Math.min(max, Math.max(0, whole ? Math.round(n) : n));
    if (ok && kept !== value) onCommit(kept);
    setText(String(ok ? kept : value));
  };
  return (
    <input
      className="text-input stp-num"
      inputMode="decimal"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
// A picture (its first letter when it isn't downloaded).
const Pic = ({ src, name }: { src: string | null | undefined; name: string }) => (src ? <img className="stp-pic" src={src} alt="" /> : <span className="stp-pic none">{name[0]}</span>);

// A box that's typed: its name and the number.
function Field({ b, label, path, max, whole, onSave }: { b: StatsBoard; label: string; path: string; max: number; whole?: boolean; onSave: Save }) {
  const value = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], b.input) as number;
  return (
    <div className="stp-field">
      <span>{label}</span>
      <NumBox value={value} label={label} max={max} whole={whole} onCommit={(v) => onSave((i) => withValue(i, path, v))} />
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

function Score({ b }: { b: StatsBoard }) {
  return (
    <section className="block" aria-label="Score">
      <div className="page-head">
        <h2>Score</h2>
      </div>
      <div className="stp-scores">
        <div>
          <div className="hexa-label">vs 380% defense</div>
          <b>{formatWhole(b.out.score380)}</b>
        </div>
        <div>
          <div className="hexa-label">vs 300% defense</div>
          <b>{formatWhole(b.out.score300)}</b>
        </div>
      </div>
    </section>
  );
}

// The game's Stats window, as typed, and the boxes worked out from it.
function StatsWindow({ b, onSave }: { b: StatsBoard; onSave: Save }) {
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
        <Shown label="Level" value={String(b.level)} />
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
                  <NumBox value={(i.stats[key] as StatsInput["stats"]["main"])[part]} label={`${label} ${{ base: "base", per: "%", abs: "% not applied" }[part]}`} max={part === "per" ? 100_000 : 10_000_000} whole={part !== "per"} onCommit={(v) => onSave((x) => withValue(x, `stats.${key}.${part}`, v))} />
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
            <NumBox value={i.stats.cdSec} label="Cooldown Reduction seconds" max={100} onCommit={(v) => onSave((x) => withValue(x, "stats.cdSec", v))} /> s
            <NumBox value={i.stats.cdPct} label="Cooldown Reduction %" max={100} onCommit={(v) => onSave((x) => withValue(x, "stats.cdPct", v))} /> %
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
function Tile({ b, id, on, onClick, children, disabled = false }: { b: StatsBoard; id: string; on: boolean; onClick?: () => void; children?: React.ReactNode; disabled?: boolean }) {
  const name = BUFF_NAMES[id] ?? GUILD_NAMES[id as keyof typeof GUILD_NAMES] ?? LINK_NAMES[id as keyof typeof LINK_NAMES] ?? id;
  const pic = <Pic src={b.icons[iconId(id)]} name={name} />;
  return (
    <div className={`stp-tile${on ? " on" : ""}${disabled ? " off" : ""}`} title={name}>
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
  const level = (path: string, value: number, label: string, max: number) => <NumBox value={value} label={label} max={max} whole onCommit={(v) => onSave((x) => withValue(x, path, v))} />;
  const main = b.labels.main;
  return (
    <section className="block" aria-label="Buffs">
      <div className="page-head">
        <h2>Buffs</h2>
      </div>
      <div className="stp-tiles">
        {STAT_BUFFS.map((k) => (
          <Tile key={k} b={b} id={k} on={i.buffs[k]} onClick={() => onSave((x) => ({ ...x, buffs: { ...x.buffs, [k]: !x.buffs[k] } }))} />
        ))}
        <Tile b={b} id={`statPotion${main}`} on={i.statPotion} onClick={() => onSave((x) => ({ ...x, statPotion: !x.statPotion }))} />
        <Tile b={b} id="sacredSymbols" on={b.sacred}>
          <span className="tiny muted" title="Every Sacred symbol maxed (the Symbols page): +20% damage against 380% bosses">{b.sacred ? "all maxed" : "not all maxed"}</span>
        </Tile>
      </div>
      <h3 className="stp-sub">One of these</h3>
      <div className="stp-tiles">
        {STAT_BUFFS_A.map((k) => (
          <Tile key={k} b={b} id={k} on={i.buffA === k} onClick={() => onSave((x) => withPick(x, "buffA", k))} />
        ))}
      </div>
      <h3 className="stp-sub">One of these</h3>
      <div className="stp-tiles">
        {STAT_BUFFS_B.filter((k) => shownFor(k, b.options.magic)).map((k) => (
          <Tile key={k} b={b} id={k} on={i.buffB === k} onClick={() => onSave((x) => withPick(x, "buffB", k))} />
        ))}
      </div>
      <h3 className="stp-sub">Guild and Champion's Renown</h3>
      <div className="stp-tiles">
        {(Object.keys(GUILD_NAMES) as (keyof StatsInput["guild"])[]).map((k) => (
          <Tile key={k} b={b} id={k} on={i.guild[k] > 0}>
            {level(`guild.${k}`, i.guild[k], GUILD_NAMES[k], 15)}
          </Tile>
        ))}
        {(Object.keys(RENOWN_NAMES) as (keyof StatsInput["renown"])[]).map((k) => (
          <div key={k} className={`stp-tile${i.renown[k] > 0 ? " on" : ""}`} title={RENOWN_NAMES[k]}>
            <Pic src={b.icons.renown} name={RENOWN_NAMES[k]} />
            {level(`renown.${k}`, i.renown[k], RENOWN_NAMES[k], 5)}
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
            <Tile key={k} b={b} id={k} on={i.eventOn && i.events[k]} disabled={!i.eventOn} onClick={() => onSave((x) => ({ ...x, events: { ...x.events, [k]: !x.events[k] } }))} />
          ))}
        </div>
        <div className="stp-grid">
          <Field b={b} label="Event ATT" path="eventStats.att" max={100_000} onSave={onSave} />
          <Field b={b} label="Event Damage %" path="eventStats.dmg" max={10_000} onSave={onSave} />
          <Field b={b} label="Event Boss Damage %" path="eventStats.boss" max={10_000} onSave={onSave} />
          <Field b={b} label="Event IED %" path="eventStats.ied" max={100} onSave={onSave} />
          <Field b={b} label="Event Crit Damage %" path="eventStats.critDmg" max={10_000} onSave={onSave} />
          <Field b={b} label="Event All Stats" path="eventStats.allStat" max={100_000} onSave={onSave} />
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
            <NumBox value={b.input.links[k]} label={LINK_NAMES[k]} max={STAT_LINKS[k]} whole onCommit={(v) => onSave((x) => withValue(x, `links.${k}`, v))} />
          </Tile>
        ))}
      </div>
      <Field b={b} label="Wild Hunter Legion" path="wildHunter" max={1_000} whole onSave={onSave} />
    </section>
  );
}

// HEXA (from the HEXA page), the Artifact, the Inner Ability line and the Oz Rings.
function Rest({ b, onSave }: { b: StatsBoard; onSave: Save }) {
  const i = b.input;
  return (
    <section className="block" aria-label="HEXA, Artifact, Inner Ability and Oz Rings">
      <h3 className="stp-sub">HEXA Enhancement</h3>
      <div className="stp-tiles">
        {b.hexa.map((n) => (
          <div key={n.node} className="stp-tile" title={n.name}>
            <Pic src={n.icon} name={n.name} />
            <b>{n.level}</b>
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
        {(["restraint", "continuous", "weapon"] as const).map((k) => {
          const name = { restraint: "Ring of Restraint", continuous: "Continuous Ring", weapon: "Weapon Jump Ring" }[k];
          return (
            <div key={k} className={`stp-tile${i.rings[k] > 0 ? " on" : ""}`} title={k === "weapon" ? `${name}: doesn't change the score (MapleScouter's damage doesn't count it)` : name}>
              <Pic src={b.rings[k]} name={name} />
              <NumBox value={i.rings[k]} label={name} max={6} whole onCommit={(v) => onSave((x) => withValue(x, `rings.${k}`, v))} />
            </div>
          );
        })}
      </div>
    </section>
  );
}

// The Stats page (v4.0.0): a character's Stats window and the rest, like MapleScouter's Enter Directly page,
// with its score.
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
  const b = board.data;
  return (
    <div className="stp-page">
      <h1 className="visually-hidden">Stats</h1>
      <GearTop world={world} onWorld={(w) => saveSettings.mutate({ worldId: w })} characters={list} current={c} onPick={setPicked} />
      {(tabs.isError || board.isError || save.error) && (
        <p className="error block" role="alert">
          {(tabs.error ?? board.error ?? save.error)!.message}
        </p>
      )}
      {(tabs.isPending || (c && board.isPending)) && <p className="notice muted block">Loading…</p>}
      {list?.length === 0 && <NoCharacters world={world} />}
      {c && b && !b.known && <p className="notice block">{b.shine ? `${c.job} is a SHINE class: its Erda Link isn't tracked yet, so its stats aren't worked out.` : `Stats for ${c.job} aren't in the figures yet.`}</p>}
      {c && b?.known && (
        <>
          <Score b={b} />
          <div className="stp-split">
            <StatsWindow b={b} onSave={save.change} />
            <div>
              <Buffs b={b} onSave={save.change} />
              <Links b={b} onSave={save.change} />
              <Rest b={b} onSave={save.change} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

import type { HexaInput, HexaStat } from "@miku/shared";
import { useEffect, useState } from "react";
import { useHexa, useHexaTabs, useSaveHexa, useSettings, useUpdateSettings } from "../api/hooks";
import type { HexaBoard, HexaOrderStep } from "../api/types";
import { GearTop, NoCharacters, useGearCharacter } from "../components/GearTop";
import { approx, dateAfter, doneShare, dungeonLabels, formatCount, formatDays, HEXA_GROUPS, levelsText, lineMax, nodeTag, perWeekOf, rankOf, readyText, sameLines, shortName, STAT_LABELS, statChoices, stepLabel, unlockedOf, wantedOf, withAllDesired, withLevel, withStatLine, withStatPick, withStatUnlocked } from "../lib/hexa";
import { formatFd } from "../lib/upgrades";

type Save = (f: (input: HexaInput) => HexaInput) => void;
type Icons = HexaBoard["icons"];

// A whole number typed in a box: saved on Enter or leaving the box (rounded, kept within its range; the box
// then shows what's saved); anything else goes back.
function NumBox({ value, label, min, max, onCommit, wide = false }: { value: number; label: string; min: number; max: number; onCommit: (n: number) => void; wide?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Number(text);
    const kept = Math.min(max, Math.max(min, Math.round(n)));
    if (text.trim() !== "" && Number.isFinite(n) && kept !== value) onCommit(kept);
    setText(String(text.trim() !== "" && Number.isFinite(n) ? kept : value));
  };
  return (
    <input
      className={`text-input count${wide ? " wide" : ""}`}
      type="number"
      min={min}
      max={max}
      step={1}
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

// A node's picture (its first letter when it isn't downloaded).
const NodeIcon = ({ icon, name }: { icon: string | null; name: string }) => (icon ? <img className="hexa-icon" src={icon} alt="" /> : <span className="hexa-icon none">{name[0]}</span>);
// A count of Sol Erda or fragments with its picture (its name when the picture isn't downloaded).
function Mat({ icon, name, n, prefix = "" }: { icon: string | null; name: string; n: number; prefix?: string }) {
  return (
    <span className="hexa-mat">
      {icon ? <img src={icon} alt={name} /> : <span className="tiny muted">{name}</span>}
      {prefix}
      {formatCount(n)}
    </span>
  );
}
const Mats = ({ icons, cost, prefix = "" }: { icons: Icons; cost: { erda: number; frags: number }; prefix?: string }) => (
  <span className="hexa-mats">
    <Mat icon={icons.erda} name="Sol Erda" n={cost.erda} prefix={prefix} />
    <Mat icon={icons.frags} name="Fragments" n={cost.frags} prefix={prefix} />
  </span>
);

// The summary: the progress bar, fragments and Sol Erda invested and left to complete (HEXA Stat's in
// them, ≈ when an average), Sol Janus counted or not.
function Summary({ b, onSave }: { b: HexaBoard; onSave: Save }) {
  const share = doneShare(b);
  return (
    <section className="block" aria-label="HEXA summary">
      <div className="page-head">
        <h2>Summary</h2>
        <label className="small muted">
          <input type="checkbox" checked={b.input.janus} onChange={(e) => onSave((i) => ({ ...i, janus: e.target.checked }))} /> Count Sol Janus
        </label>
      </div>
      <span className="chance-track hexa-bar">
        <i style={{ width: `${share * 100}%` }} />
      </span>
      <div className="hexa-sum">
        <div role="group" aria-label="Invested">
          <div className="hexa-label">Invested</div>
          <Mats icons={b.icons} cost={b.invested} prefix={approx(b.invested.exact)} />
        </div>
        <div role="group" aria-label="Left to complete">
          <div className="hexa-label">Left to complete</div>
          <Mats icons={b.icons} cost={b.left} prefix={approx(b.left.exact)} />
        </div>
        <div className="hexa-done">
          <div className="hexa-label">Complete</div>
          <b>{Math.floor(share * 1000) / 10}%</b>
        </div>
      </div>
    </section>
  );
}

const STAT_NAMES = ["HEXA Stat I", "HEXA Stat II", "HEXA Stat III"] as const;
const LINE_NAMES = ["Main line", "Additional line 1", "Additional line 2"] as const;

// One HEXA Stat node, as typed (shown at once): unlocked or not, its three lines (stat and level), its rank;
// the level it needs, from the server.
function StatCard({ b, i, onSave }: { b: HexaBoard; i: number; onSave: Save }) {
  const s = b.input.stats[i]!;
  const [rank, unlocked] = [rankOf(s), unlockedOf(s)];
  const view = b.stats[i]!;
  const needs = view.needs;
  const name = STAT_NAMES[i]!;
  return (
    <div className={`hexa-stat${unlocked ? "" : " locked"}`} role="group" aria-label={name}>
      <div className="hexa-stat-head">
        <span>
          <NodeIcon icon={b.icons.stat} name="H" />
          <b>{name.replace("HEXA ", "")}</b>
        </span>
        <label className="tiny muted">
          <input type="checkbox" aria-label={`${name} unlocked`} checked={unlocked} disabled={rank > 0} onChange={(e) => onSave((x) => withStatUnlocked(x, i, e.target.checked))} /> Unlocked
        </label>
      </div>
      {LINE_NAMES.map((line, j) => (
        <div key={line} className="hexa-line small">
          <select aria-label={`${name} ${line} stat`} value={s.lines[j]!.stat ?? ""} onChange={(e) => onSave((x) => withStatPick(x, i, j, (e.target.value || null) as HexaStat | null))}>
            <option value="">{j === 0 ? "Main…" : "Additional…"}</option>
            {statChoices(b.input, i, j).map((st) => (
              <option key={st} value={st}>
                {STAT_LABELS[st]}
              </option>
            ))}
          </select>
          <NumBox value={s.lines[j]!.level} label={`${name} ${line} level`} min={0} max={lineMax(b.input, i, j)} onCommit={(v) => onSave((x) => withStatLine(x, i, j, v))} />
          <span className="tiny muted">/10</span>
        </div>
      ))}
      <div className="hexa-rank tiny muted">
        <span>Rank {rank} / 20</span>
        <span className="chance-track">
          <i style={{ width: `${rank * 5}%` }} />
        </span>
      </div>
      {/* (worked out from the lines as saved, every node's: one node's assumed stats skip the others' main
          lines; while a change to any of them is being saved, not yet) */}
      <p className="tiny muted">
        {!b.stats.every((v, j) => sameLines(v.lines, b.input.stats[j]!.lines))
          ? "working out…"
          : `${rank >= 20 ? formatFd(view.fdNow) : `≈ ${formatFd(view.fdToCome)} to rank 20`}${view.assumed ? ` · best stats assumed (${view.worked.map((st) => STAT_LABELS[st]).join(", ")})` : ""}`}
      </p>
      {needs !== null && <p className="tiny muted">Needs Lv. {needs}</p>}
    </div>
  );
}

// Current progress: each node's level now and wanted, by group, then the HEXA Stat nodes.
function Progress({ b, onSave }: { b: HexaBoard; onSave: Save }) {
  return (
    <section className="block" aria-label="Current progress">
      <div className="page-head">
        <h2>Current progress</h2>
        <div className="row small">
          <span className="tiny muted">level now → wanted</span>
          <button type="button" className="btn ghost tight" onClick={() => onSave((i) => withAllDesired(i, "max"))}>
            Want all at 30
          </button>
          <button type="button" className="btn ghost tight" onClick={() => onSave((i) => withAllDesired(i, "current"))}>
            Want all as now
          </button>
        </div>
      </div>
      <div className="hexa-groups">
        {HEXA_GROUPS.map(([group, label]) => (
          <div key={group} role="group" aria-label={label}>
            <div className="gear-group">{label}</div>
            {b.nodes
              .filter((n) => n.group === group)
              .map((n) => (
                <div key={n.key} className={`hexa-node small${b.input.current[n.key] === n.max ? " maxed" : ""}`}>
                  <NodeIcon icon={n.icon} name={n.name} />
                  <span className="hexa-name" title={n.name}>
                    {nodeTag(n.key) && <span className="hexa-tag">{nodeTag(n.key)}</span>}
                    {shortName(n.name)}
                  </span>
                  <NumBox value={b.input.current[n.key]} label={`${n.name} level now`} min={n.min} max={n.max} onCommit={(v) => onSave((i) => withLevel(i, "current", n.key, v, n.min, n.max))} />
                  <span className="tiny muted">→</span>
                  <NumBox value={wantedOf(b.input, n.key)} label={`${n.name} level wanted`} min={0} max={n.max} onCommit={(v) => onSave((i) => withLevel(i, "desired", n.key, v, n.min, n.max))} />
                  <span className="tiny muted">/{n.max}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
      <div className="gear-group hexa-stat-title">HEXA Stat</div>
      <div className="hexa-stats">
        {b.stats.map((_, i) => (
          <StatCard key={STAT_NAMES[i]} b={b} i={i} onSave={onSave} />
        ))}
      </div>
    </section>
  );
}

// The fragment calculator, in one row: owned, farmed a day, Erda's Request, the Epic Dungeon; then how
// much comes in and how long to everything wanted.
function Fragments({ b, onSave }: { b: HexaBoard; onSave: Save }) {
  const when = dateAfter(b.fragments.days, new Date());
  return (
    <section className="block" aria-label="Fragment calculator">
      <h2 className="hexa-calc-title">
        {b.icons.frags && <img src={b.icons.frags} alt="" />}
        Fragment calculator
      </h2>
      <div className="hexa-calc small">
        <label>
          Owned <NumBox value={b.input.owned} label="Fragments owned" min={0} max={10_000_000} wide onCommit={(v) => onSave((i) => ({ ...i, owned: v }))} />
        </label>
        <label>
          Per day <NumBox value={b.input.perDay} label="Fragments a day from farming" min={0} max={100_000} onCommit={(v) => onSave((i) => ({ ...i, perDay: v }))} />
        </label>
        <label>
          <input type="checkbox" aria-label="Erda's Request" checked={b.input.erdaRequest} onChange={(e) => onSave((i) => ({ ...i, erdaRequest: e.target.checked }))} /> Erda's Request
        </label>
        <label>
          Epic Dungeon{" "}
          <select aria-label="Epic Dungeon" value={b.input.dungeon} onChange={(e) => onSave((i) => ({ ...i, dungeon: e.target.value as HexaInput["dungeon"] }))}>
            {dungeonLabels(b.figures.dungeons).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="hexa-calc-out small muted" role="status">
        <span>
          Coming in <b>{formatCount(perWeekOf(b.input, b.figures))}</b> a week
        </span>
        <span>
          Everything wanted: <b>{formatDays(b.fragments.days)}</b>
          {when && b.fragments.days !== 0 && ` (${when})`}
        </span>
      </p>
    </section>
  );
}

// The upgrade priority: the next upgrade on top, then each one after it, scrolling on its own; held in view.
function Priority({ b }: { b: HexaBoard }) {
  const now = new Date();
  const [next, ...rest] = b.priority;
  return (
    <section className="block hexa-side" aria-label="Upgrade priority">
      <div className="page-head">
        <h2>Upgrade priority</h2>
        <span className="tiny muted">
          {b.priority.length} upgrades · <span className="good">{formatFd(b.fdToDesired)}</span> in all
        </span>
      </div>
      {!next ? (
        <p className="notice muted">Nothing left: every node is at the level wanted.</p>
      ) : (
        <>
          <div className={`hexa-next${next.days === 0 ? " affordable" : ""}`} role="group" aria-label="Next upgrade">
            <div className="tiny muted">Next upgrade</div>
            <div className="hexa-next-row">
              <span className="hexa-next-name">
                <NodeIcon icon={next.icon} name={next.name} />
                <b title={next.name}>
                  {shortName(next.name)} → {next.to}
                </b>
              </span>
              <b className="good">{`${next.partial || next.node.startsWith("stat") ? "≈ " : ""}${formatFd(next.fd)}`}</b>
            </div>
            <div className="hexa-next-row">
              <span className="tiny muted">
                {levelsText(next)} · ready {readyText(next.days, now)}
              </span>
              <Mats icons={b.icons} cost={next.cost} prefix={next.node.startsWith("stat") ? "≈ " : ""} />
            </div>
          </div>
          <div className="hexa-priority">
            <table className="flame-targets">
              <thead>
                <tr>
                  <th>Node</th>
                  <th className="num">Lv.</th>
                  <th className="num">{b.icons.erda ? <img className="hexa-th" src={b.icons.erda} alt="Sol Erda" /> : "Sol Erda"}</th>
                  <th className="num">{b.icons.frags ? <img className="hexa-th" src={b.icons.frags} alt="Fragments" /> : "Fragments"}</th>
                  <th className="num">FD</th>
                  <th className="num">Ready</th>
                </tr>
              </thead>
              <tbody>
                {rest.map((r) => (
                  <tr key={`${r.node}-${r.from}-${r.to}`} className={r.days === 0 ? "affordable" : undefined}>
                    <td>
                      <span className="hexa-cell" title={`${r.name} ${levelsText(r)}`}>
                        <NodeIcon icon={r.icon} name={r.name} />
                        <span className="hexa-name">{shortName(r.name)}</span>
                      </span>
                    </td>
                    <td className="num">{r.to}</td>
                    <td className="num">{formatCount(r.cost.erda)}</td>
                    <td className="num">
                      {r.node.startsWith("stat") && "≈ "}
                      {formatCount(r.cost.frags)}
                    </td>
                    <td className="num good">{`${r.partial || r.node.startsWith("stat") ? "≈ " : ""}${formatFd(r.fd)}`}</td>
                    <td className="num tiny">{readyText(r.days, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="tiny muted">FD: the skills', MapleScouter's figures (the order built from them); HEXA Stat's, from your stat values, on average. Sol Janus isn't listed (no damage). Green: you have the fragments now.</p>
    </section>
  );
}

// One step of the full order, its details shown on hover (or focus).
function Step({ s, n, state, icons, now }: { s: HexaOrderStep; n: number; state: string; icons: Icons; now: Date }) {
  const stat = s.node.startsWith("stat");
  return (
    <li className={`hexa-step ${state}`} tabIndex={0} aria-label={`${n}. ${s.name} ${levelsText(s)}`}>
      <span className="hexa-step-pic">
        <NodeIcon icon={s.icon} name={s.name} />
        {stat && <span className="hexa-roman">{["I", "II", "III"][Number(s.node.slice(4)) - 1]}</span>}
      </span>
      <span className="hexa-step-lv">{stepLabel(s)}</span>
      <span className="hexa-tip" role="tooltip">
        <b>
          {n}. {s.name} {stat ? "unlock → rank 20" : levelsText(s)}
        </b>
        <Mats icons={icons} cost={s.cost} prefix={stat ? "≈ " : ""} />
        <span className="good">{`${stat ? "≈ " : ""}${formatFd(s.fd)}`}</span>
        {stat && <span className="muted">rank 0 to 20 on average, with its stats (or the best for you)</span>}
        <span className="muted">{s.done ? "done" : s.days === 0 ? "you have the fragments now" : `ready ${readyText(s.days, now)}`}</span>
      </span>
    </li>
  );
}

// The full order: every step of the job's order (the same node several in a row joined), done ones faded,
// the next ringed, affordable ones green; hover for the details.
function FullOrder({ b }: { b: HexaBoard }) {
  const [hide, setHide] = useState(false);
  const now = new Date();
  const next = b.order.findIndex((s) => !s.done);
  const shown = b.order.map((s, i) => ({ s, n: i + 1, state: s.done ? "done" : i === next ? "next" : s.days === 0 ? "affordable" : "" })).filter((x) => !hide || !x.s.done);
  return (
    <section className="block" aria-label="Full upgrade order">
      <div className="page-head">
        <h2>Full upgrade order</h2>
        <label className="small muted">
          <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} /> Hide done
        </label>
      </div>
      <p className="tiny muted">MapleScouter's order for GMS Heroic worlds; the same skill several steps in a row is one step. Sol Janus isn't in it (no damage).</p>
      <ol className="hexa-order">
        {shown.map(({ s, n, state }) => (
          <Step key={n} s={s} n={n} state={state} icons={b.icons} now={now} />
        ))}
      </ol>
      <p className="hexa-legend tiny muted">
        <span className="next">next</span>
        <span className="affordable">you have the fragments now</span>
        <span className="done">done</span>
        <span>Number: the level it goes to (MAX: 30; HEXA Stat: unlocked and rank 20)</span>
      </p>
    </section>
  );
}

// The HEXA page (v3.0.0; every job from v3.1.0): a character's HEXA Matrix. Two views: the tracker, and the
// full order.
export function HexaPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const tabs = useHexaTabs(world);
  const [picked, setPicked] = useGearCharacter();
  const [view, setView] = useState<"tracker" | "order">("tracker");
  const list = tabs.data?.characters;
  const c = list?.find((x) => x.id === picked) ?? list?.[0];
  const board = useHexa(c?.known ? c.id : undefined);
  const save = useSaveHexa(c?.id);
  const onSave = save.change;
  const b = board.data;
  return (
    <div className="hexa-page">
      <h1 className="visually-hidden">HEXA</h1>
      <GearTop world={world} onWorld={(w) => saveSettings.mutate({ worldId: w })} characters={list} current={c} onPick={setPicked} />
      {(tabs.isError || board.isError || save.error) && (
        <p className="error block" role="alert">
          {(tabs.error ?? board.error ?? save.error)!.message}
        </p>
      )}
      {(tabs.isPending || (c?.known && board.isPending)) && <p className="notice muted block">Loading…</p>}
      {list?.length === 0 && <NoCharacters world={world} />}
      {c && !c.known && <p className="notice block">{c.shine ? `${c.job} is a SHINE class: it has Erda Link instead of the HEXA Matrix.` : `HEXA for ${c.job} isn't in the figures yet.`}</p>}
      {c?.known && b?.known && (
        <>
          <div className="hexa-view">
            <div className="segmented" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "tracker"} onClick={() => setView("tracker")}>
                Tracker
              </button>
              <button type="button" aria-pressed={view === "order"} onClick={() => setView("order")}>
                Full order
              </button>
            </div>
          </div>
          {view === "tracker" ? (
            <div className="hexa-split">
              <div>
                <Summary b={b} onSave={onSave} />
                <Progress b={b} onSave={onSave} />
                <Fragments b={b} onSave={onSave} />
              </div>
              <Priority b={b} />
            </div>
          ) : (
            <>
              <Summary b={b} onSave={onSave} />
              <FullOrder b={b} />
            </>
          )}
        </>
      )}
    </div>
  );
}

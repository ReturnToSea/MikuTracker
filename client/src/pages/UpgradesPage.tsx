import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useGear, useRefreshStatus, useSaveStatValues, useSettings, useUpdateSettings, useUpgrades } from "../api/hooks";
import type { UpgradeStep } from "../api/types";
import { StatValuesBox } from "../components/GearDetails";
import { GearTop, ItemIcon, NoCharacters, useGearCharacter } from "../components/GearTop";
import { UpgradesChart } from "../components/UpgradesChart";
import { formatMeso } from "../lib/flames";
import { CUBE_EVENT_LABELS, type CubeEvent, cubeEventsParam, cubePrice } from "../lib/potential";
import { eventsParam, SF_EVENT_LABELS, type SfEventKey } from "../lib/starForce";
import { chanceText, costNote, formatFd, nowText, pageFor, stepKey, SYSTEM_NAME } from "../lib/upgrades";

const Chip = ({ s }: { s: UpgradeStep }) => <span className={`sys-chip sys-${s.system}`}>{SYSTEM_NAME[s.system]}</span>;

// List: every step, cheapest per 1% final damage first; a row opens that system's page with the item picked.
function List({ steps, sf, cubes }: { steps: UpgradeStep[]; sf: string; cubes: string }) {
  const navigate = useNavigate();
  return (
    <section className="block" aria-label="All steps">
      {/* (a narrow window scrolls the table, not the page) */}
      <div className="table-scroll">
        <table className="flame-targets upgrades-list">
          <thead>
            <tr>
              <th>#</th>
              <th />
              <th>Item</th>
              <th>System</th>
              <th>Step</th>
              <th className="num">Meso per 1% FD</th>
              <th className="num">Cost</th>
              <th className="num">Adds</th>
              <th>Chance</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr key={`${s.system}-${s.slot}`} className={i === 0 ? "cheapest" : undefined} onClick={() => navigate(pageFor(s, sf, cubes))}>
                <td className="muted">{i + 1}</td>
                {/* (the name is beside it: an item with no icon leaves the space empty) */}
                <td>{s.icon && <ItemIcon item={s} />}</td>
                <td>
                  <Link to={pageFor(s, sf, cubes)} onClick={(e) => e.stopPropagation()}>
                    {s.name}
                  </Link>
                  <div className="tiny muted">{nowText(s)}</div>
                </td>
                <td>
                  <Chip s={s} />
                </td>
                <td>
                  <b>{s.step}</b>
                </td>
                <td className={`num${i === 0 ? " gold" : ""}`}>{formatMeso(s.perFd)}</td>
                <td className="num">
                  {formatMeso(s.cost)}
                  <div className="tiny muted">{costNote(s)}</div>
                </td>
                <td className="num">{formatFd(s.fd)}</td>
                <td className="small">{chanceText(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted">Cost and adds are averages: the whole step (the meso to any better flame or roll; Star Force's jump with its booms). Click a row to open that system's page with the item picked.</p>
    </section>
  );
}

// Chart: every step as a dot; the picked one's figures and its item's other steps below.
function Chart({ steps, sf, cubes }: { steps: UpgradeStep[]; sf: string; cubes: string }) {
  // the step picked, remembered by which step it is (a new order keeps it; gone, the cheapest again)
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const found = steps.findIndex((x) => stepKey(x) === pickedKey);
  const picked = found < 0 ? 0 : found;
  const setPicked = (i: number) => setPickedKey(stepKey(steps[i]!));
  const s = steps[picked]!;
  const same = steps.map((x, i) => [x, i] as const).filter(([x]) => x.slot === s.slot && x.system !== s.system);
  return (
    <section className="block" aria-label="Cost against gain">
      <h2>
        Cost against gain <span className="muted small">each dot one step; up and left is better; a dashed line: the same meso per 1% final damage; click a dot</span>
      </h2>
      <UpgradesChart steps={steps} picked={picked} onPick={setPicked} />
      <div className="flame-split" aria-label="Picked step">
        <div className="flame-tiles">
          <div className="flame-tile wide">
            <div className="tiny muted">
              #{picked + 1} on the list · <Chip s={s} />
            </div>
            <div className="big">
              {s.name} <span className="muted small">{s.step}</span>
            </div>
            <div className="tiny muted">{nowText(s)}</div>
          </div>
          <div className="flame-tile">
            <div className="tiny muted">Meso / 1% FD</div>
            <div className="big">{formatMeso(s.perFd)}</div>
          </div>
          <div className="flame-tile">
            <div className="tiny muted">Cost</div>
            <div className="big">{formatMeso(s.cost)}</div>
            <div className="tiny muted">{costNote(s)}</div>
          </div>
          <div className="flame-tile">
            <div className="tiny muted">Adds</div>
            <div className="big">{formatFd(s.fd)}</div>
            <div className="tiny muted">final damage</div>
          </div>
          <div className="flame-tile">
            <div className="tiny muted">Chance</div>
            <div className="big small">{chanceText(s)}</div>
          </div>
        </div>
        <div>
          <div className="tiny muted">The item's other steps</div>
          {same.length === 0 ? (
            <p className="tiny muted">None: this is its only step.</p>
          ) : (
            same.map(([x, i]) => (
              <button key={x.system} type="button" className="kv-row small upgrades-other" onClick={() => setPicked(i)}>
                <span>
                  #{i + 1} <Chip s={x} /> {x.step}
                </span>
                <b>{formatMeso(x.perFd)} per 1%</b>
              </button>
            ))
          )}
          <p className="small">
            <Link to={pageFor(s, sf, cubes)}>Open it on the {SYSTEM_NAME[s.system]} page</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

// The Gear group's Upgrades page: each item's next step in each system, as their pages work them out,
// cheapest per 1% final damage first (List), or as cost against gain (Chart).
export function UpgradesPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const gear = useGear(world);
  const saveValues = useSaveStatValues(world);
  useRefreshStatus();
  const [picked, setPicked] = useGearCharacter();
  const [view, setView] = useState<"list" | "chart">("list");
  const [sf, setSf] = useState<ReadonlySet<SfEventKey>>(new Set());
  const [cubes, setCubes] = useState<ReadonlySet<CubeEvent>>(new Set());
  const b = gear.data;
  const c = b?.characters.find((x) => x.id === picked) ?? b?.characters[0];
  const upgrades = useUpgrades(c?.id, eventsParam(sf), cubeEventsParam(cubes));
  const board = upgrades.data;
  const failed = saveValues.error ?? saveSettings.error;
  const toggle = <K,>(set: ReadonlySet<K>, k: K, on: boolean): ReadonlySet<K> => {
    const next = new Set(set);
    if (on) next.add(k);
    else next.delete(k);
    return next;
  };

  return (
    <>
      <h1 className="visually-hidden">Upgrades</h1>
      <GearTop
        world={world}
        onWorld={(w) => {
          saveValues.reset();
          saveSettings.mutate({ worldId: w });
        }}
        characters={b?.characters}
        current={c}
        onPick={(id) => {
          saveValues.reset();
          setPicked(id);
        }}
      />
      {failed && (
        <p className="error block" role="alert">
          {failed.message}
        </p>
      )}
      {(gear.isError || upgrades.isError) && (
        <p className="error block" role="alert">
          Couldn't load the upgrades: {(gear.error ?? upgrades.error)!.message}
        </p>
      )}
      {(gear.isPending || (c && upgrades.isPending)) && <p className="notice muted block">Loading…</p>}
      {b?.characters.length === 0 && <NoCharacters world={world} />}
      {c && board && (
        <>
          <section className="block">
            <div className="page-head">
              <div className="row">
                <h2>Upgrades</h2>
                <div className="segmented" role="group" aria-label="View">
                  <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
                    List
                  </button>
                  <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
                    Chart
                  </button>
                </div>
              </div>
              <div className="row small muted">
                <span>Events:</span>
                <span className="tiny">STAR FORCE</span>
                {SF_EVENT_LABELS.map(([k, label]) => (
                  <label key={k}>
                    <input type="checkbox" checked={sf.has(k)} onChange={(e) => setSf(toggle(sf, k, e.target.checked))} /> {label}
                  </label>
                ))}
                <span className="tiny">CUBES</span>
                {CUBE_EVENT_LABELS.map(([k, label]) => (
                  <label key={k}>
                    <input type="checkbox" checked={cubes.has(k)} onChange={(e) => setCubes(toggle(cubes, k, e.target.checked))} /> {label}
                  </label>
                ))}
              </div>
            </div>
            <p className="tiny muted">
              {c.name} · {c.job} · each item's next step on Flames, Star Force and Potential, as those pages work it out · Black Flame {formatMeso(board.blackFlamePrice)} · MVP: {board.mvp} · Glowing {cubePrice(board.prices.glowing)} · Bright{" "}
              {cubePrice(board.prices.bright)} a cube · rank-up chances are community estimates · final damage per 100 score: {c.statValues.fdPer100}%
            </p>
            {!board.known ? (
              <p className="notice">{c.job} isn't in the item list yet, so its main stat isn't known and its upgrades can't be worked out.</p>
            ) : (
              board.steps.length === 0 && <p className="notice muted">Nothing to upgrade: no equipped item has a next step that adds final damage. Equip items and save their details on the Equipment page.</p>
            )}
          </section>
          {board.known && board.steps.length > 0 && (view === "list" ? <List steps={board.steps} sf={eventsParam(sf)} cubes={cubeEventsParam(cubes)} /> : <Chart key={c.id} steps={board.steps} sf={eventsParam(sf)} cubes={cubeEventsParam(cubes)} />)}
          <section className="block" aria-label="Stat values">
            <StatValuesBox c={c} onSave={(values) => saveValues.mutate({ id: c.id, values })} />
          </section>
        </>
      )}
    </>
  );
}

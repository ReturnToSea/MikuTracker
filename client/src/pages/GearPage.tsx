import { useEffect, useMemo, useState } from "react";
import type { GearDetailsInput, StatValuesTyped } from "@miku/shared";
import { useFlames, useGear, useRefreshStatus, useSaveGear, useSaveGearDetails, useSaveStatValues, useSettings, useUpdateSettings } from "../api/hooks";
import type { FlameItem, GearBoard, GearCharacter, GearItemView } from "../api/types";
import { DetailsEditor, IconRow, StatValuesBox } from "../components/GearDetails";
import { GearTop, NoCharacters, useGearCharacter } from "../components/GearTop";
import { DEFAULT_BUDGET } from "../lib/flames";
import { byKey, counted, grouped, LAYOUT, listed, opener, options, ozElsewhere, setCounts, SLOT_ORDER, TOTEMS, type Items } from "../lib/gear";

const Icon = ({ item }: { item: GearItemView | undefined }) => (item?.icon ? <img className="item-icon" src={item.icon} alt="" loading="lazy" /> : <span className="no-icon">no icon</span>);

// The "Other item" box: a name typed for something the lists don't have.
function OtherItem({ current, onUse }: { current: string; onUse: (name: string) => void }) {
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);
  const use = () => text.trim() && onUse(text.trim());
  return (
    <div className="gear-other">
      <input className="text-input" aria-label="Other item" placeholder="Other item: type its name" maxLength={60} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && use()} />
      <button type="button" className="btn" onClick={use} disabled={!text.trim()}>
        Use
      </button>
    </div>
  );
}

// The game's equipment window for one character, with the slot lists beside it.
interface WindowProps {
  board: GearBoard;
  c: GearCharacter;
  items: Items;
  onSave: (slot: string, input: { item: string } | { other: string } | { clear: true }) => void;
  onSaveDetails: (slot: string, details: GearDetailsInput) => void;
  onSaveValues: (values: StatValuesTyped) => void;
  savingDetails: boolean;
  flames: FlameItem[] | undefined; // each flameable item's score (none for a job the list doesn't know)
}
function GearWindow({ board, c, items, onSave, onSaveDetails, onSaveValues, savingDetails, flames }: WindowProps) {
  const [slot, setSlot] = useState("hat");
  // the item being edited below (the first equipped one to start with)
  const [detailSlot, setDetailSlot] = useState<string | null>(null);
  const firstEquipped = SLOT_ORDER.find((k) => c.equipped[k]) ?? null;
  const editing = detailSlot !== null && c.equipped[detailSlot] ? detailSlot : firstEquipped;
  const eq = c.equipped;
  const label = (key: string) => (key === "ringP" ? "Passive ring" : board.slots.find((s) => s.key === key)!.label);
  const open = opener(eq, items);
  const covered = !counted(eq, "bottom", items);
  const passive = listed(eq, "ringP", items);
  const passiveCounts = counted(eq, "ringP", items);
  // What a slot shows: the item's icon, a typed name, or nothing.
  const inside = (key: string) => {
    const e = eq[key];
    if (!e) return covered && key === "bottom" ? <span className="slot-text">covered by the overall</span> : null;
    if ("other" in e) return <span className="slot-text">{e.other}</span>;
    const item = items.get(e.item);
    return item ? <Icon item={item} /> : <span className="slot-text">no longer listed</span>;
  };
  const named = (key: string) => {
    const e = eq[key];
    return !e ? "empty" : "other" in e ? e.other : (items.get(e.item)?.name ?? "no longer listed");
  };
  const cell = (key: string) => {
    const blocked = covered && key === "bottom";
    return (
      <div key={key} className="gear-cell">
        <button
          type="button"
          className={`gear-slot${blocked ? " covered" : ""}`}
          aria-pressed={slot === key}
          aria-label={`${label(key)}: ${named(key)}${blocked ? " (not counted: the overall covers the bottom)" : ""}`}
          title={blocked ? "An overall covers the bottom: what's saved here is kept but not counted" : named(key) === "empty" ? label(key) : named(key)}
          onClick={() => setSlot(key)}
        >
          {inside(key)}
          <span className="slot-label">{label(key)}</span>
        </button>
        {key === open && (
          <button type="button" className={`gear-plus${eq.ringP ? " has" : ""}`} aria-pressed={slot === "ringP"} aria-label={`Passive ring: ${named("ringP")}`} title="Passive special skill ring" onClick={() => setSlot("ringP")}>
            {passive ? <Icon item={passive} /> : eq.ringP ? "?" : "+"}
          </button>
        )}
        {key === "ring1" && open === null && eq.ringP && (
          <button type="button" className="gear-kept" aria-label={`Passive ring, kept but not counted: ${named("ringP")}`} title={`${named("ringP")} is kept, and counts again once a Ring of Restraint or Continuous Ring Lv. 4+ is in a ring slot`} onClick={() => setSlot("ringP")}>
            <Icon item={passive} />
          </button>
        )}
      </div>
    );
  };
  const { sets, lucky } = setCounts(eq, items);

  const list = options(board, c, slot, items);
  const current = eq[slot];
  const blockedBy = ozElsewhere(eq, slot, items);
  const activeRing = open === null ? null : listed(eq, open, items)!;
  const note =
    slot === "ringP"
      ? open === null
        ? "The passive ring slot is closed: it opens with a Ring of Restraint or Continuous Ring at Lv. 4 or higher in a ring slot. What's kept here doesn't count until then."
        : `Opened by the ${activeRing!.name} (v.271: one active and one passive special skill ring).${passive && !passiveCounts ? " The same Continuous Ring can't be both, so this one doesn't count." : ""}`
      : slot === "bottom" && covered
        ? "The overall covers the bottom: what's saved here is kept but doesn't count until a normal top is on."
        : slot === "android"
        ? "The android slot is left empty for now."
        : `${list.length} item${list.length === 1 ? "" : "s"} for ${c.job}.${blockedBy ? ` Only one special skill ring can be in the ring slots (${blockedBy.name} is in one), so the others are off here.` : ""}`;

  return (
    <>
    <div className="gear">
      <section className="block gear-window" aria-label="Equipment window">
        <div className="gear-grid">{LAYOUT.map((key, i) => (key ? cell(key) : <div key={`gap${i}`} aria-hidden="true" />))}</div>
        <div className="gear-totems" role="group" aria-label="Totems">
          <span className="tiny muted">Totems</span>
          {TOTEMS.map(cell)}
        </div>
        <div className="gear-sets" aria-label="Sets">
          <div className="gear-group">Sets</div>
          {sets.length === 0 ? (
            <span className="muted small">No set pieces yet.</span>
          ) : (
            sets.map((s) => (
              <div key={s.set} className="limit-row small">
                <span>
                  {s.set}
                  {s.lucky && <span className="tiny gold"> +1 lucky ({lucky!.name})</span>}
                </span>
                <b>{s.count}</b>
              </div>
            ))
          )}
        </div>
        <StatValuesBox c={c} page="all" onSave={onSaveValues} />
      </section>
      <section className="block gear-panel" aria-label={`${label(slot)} slot`}>
        <h2>{label(slot)}</h2>
        <p className="muted small">{note}</p>
        <div className="gear-list">
          <button type="button" className="gear-item" aria-pressed={!current} onClick={() => current && onSave(slot, { clear: true })}>
            <span className="no-icon">—</span>
            <span>None</span>
            <span />
          </button>
          {(slot !== "ringP" || open !== null) &&
            grouped(list).map((g) => (
              <div key={g.group} role="group" aria-label={g.group} className="gear-items">
                <div className="gear-group">{g.group}</div>
                {g.items.map((item) => {
                  const on = current !== undefined && "item" in current && current.item === item.key;
                  const off = slot !== "ringP" && item.oz !== undefined && blockedBy !== null;
                  return (
                    <button key={item.key} type="button" className="gear-item" aria-pressed={on} disabled={off} onClick={() => !on && onSave(slot, { item: item.key })}>
                      <Icon item={item} />
                      <span>
                        <b className="small">{item.name}</b>
                        <div className="tiny muted">
                          Lv. {item.level ?? "—"}
                          {item.oz && ` · ${item.oz.kind} ring`}
                          {item.lucky && " · lucky item"}
                        </div>
                      </span>
                      {item.set ? <span className="set-badge">{item.set}</span> : <span />}
                    </button>
                  );
                })}
              </div>
            ))}
          {slot !== "ringP" && (
            <>
              <div className="gear-group">Not listed</div>
              <OtherItem key={slot} current={current && "other" in current ? current.other : ""} onUse={(name) => onSave(slot, { other: name })} />
            </>
          )}
        </div>
      </section>
    </div>
    <section className="block" aria-label="Pick an item to edit">
      <h2 className="visually-hidden">Stars, potential and flames</h2>
      <IconRow board={board} c={c} items={items} picked={editing} onPick={setDetailSlot} flames={flames} />
    </section>
    {editing && <DetailsEditor key={`${c.id}-${editing}-${JSON.stringify(c.equipped[editing])}`} board={board} c={c} slot={editing} items={items} saving={savingDetails} onSave={(d) => onSaveDetails(editing, d)} flame={flames?.find((f) => f.slot === editing)} />}
    </>
  );
}

// The Gear group's Equipment page: what each character has equipped, in the game's equipment window,
// and each item's stars, potential, flames and hammers.
export function GearPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const board = useGear(world);
  const save = useSaveGear(world);
  const saveDetails = useSaveGearDetails(world);
  const saveValues = useSaveStatValues(world);
  const failed = save.error ?? saveDetails.error ?? saveValues.error;
  const resetSaves = () => {
    save.reset();
    saveDetails.reset();
    saveValues.reset();
  };
  useRefreshStatus();
  const [picked, setPicked] = useGearCharacter();

  const b = board.data;
  const c = b?.characters.find((x) => x.id === picked) ?? b?.characters[0];
  const items = useMemo(() => (b ? byKey(b.items) : new Map()), [b]);
  const flames = useFlames(c?.id, DEFAULT_BUDGET);

  return (
    <>
      <h1 className="visually-hidden">Gear</h1>
      <GearTop
        world={world}
        onWorld={(w) => {
          resetSaves();
          saveSettings.mutate({ worldId: w });
        }}
        characters={b?.characters}
        current={c}
        onPick={(id) => {
          resetSaves();
          setPicked(id);
        }}
      />
      {failed && (
        <p className="error block" role="alert">
          {failed.message}
        </p>
      )}
      {board.isError && (
        <p className="error block" role="alert">
          Couldn't load the gear: {board.error.message}
        </p>
      )}
      {board.isPending && <p className="notice muted block">Loading…</p>}
      {b?.characters.length === 0 && <NoCharacters world={world} />}
      {b && c && (
        <>
          {!c.knownJob && (
            <p className="notice block">
              {c.job} isn't in the item list yet, so every class's items are offered for {c.name}.
            </p>
          )}
          <GearWindow
            key={c.id}
            board={b}
            c={c}
            items={items}
            onSave={(slot, input) => save.mutate({ id: c.id, slot, input })}
            onSaveDetails={(slot, details) => saveDetails.mutate({ id: c.id, slot, details })}
            onSaveValues={(values) => saveValues.mutate({ id: c.id, values })}
            savingDetails={saveDetails.isPending}
            flames={flames.data?.known ? flames.data.items : undefined}
          />
        </>
      )}
    </>
  );
}

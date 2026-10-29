import { worldName } from "@miku/shared";
import { useEffect, useState } from "react";
import { BUDGET_PRESETS, budgetFrom } from "../lib/flames";
import type { GearCharacter } from "../api/types";
import { Avatar } from "./Avatar";
import { WorldSwitcher } from "./WorldSwitcher";

// The character picked on the Gear pages, kept while moving between them (Equipment, Flames) for this
// browser tab. Storage can be missing or refuse (a private window): then it's just not remembered.
const KEY = "miku-gear-character";
function remembered(): number | null {
  try {
    const n = Number(sessionStorage.getItem(KEY));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
export function useGearCharacter(): [number | null, (id: number) => void] {
  const [picked, setPicked] = useState<number | null>(remembered);
  const pick = (id: number) => {
    setPicked(id);
    try {
      sessionStorage.setItem(KEY, String(id));
    } catch {
      // not remembered
    }
  };
  return [picked, pick];
}

// The top of a Gear page: the world, and the world's characters as tabs.
// (also the HEXA page's: only what the tabs show)
type Tab = Pick<GearCharacter, "id" | "name" | "level" | "job" | "avatar">;
export function GearTop({ world, onWorld, characters, current, onPick }: { world: number; onWorld: (w: number) => void; characters: Tab[] | undefined; current: Tab | undefined; onPick: (id: number) => void }) {
  return (
    <section className="block top">
      <div className="page-head">
        <WorldSwitcher world={world} onChange={onWorld} />
      </div>
      {characters && characters.length > 0 && (
        <div className="strip" role="tablist" aria-label="Characters">
          {characters.map((x) => (
            <button key={x.id} type="button" role="tab" className="ctab" aria-selected={x.id === current?.id} onClick={() => onPick(x.id)}>
              <Avatar src={x.avatar} size={36} name={x.name} />
              <span>
                <b>{x.name}</b>
                <small>
                  Lv. {x.level} · {x.job}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// What a Gear page says when the world has no characters.
export const NoCharacters = ({ world }: { world: number }) => (
  <section className="block">
    <p className="notice muted">No characters on {worldName(world)} yet. Add them on Home first.</p>
  </section>
);

// An item's icon on a Gear page (a typed item without one: its name).
export const ItemIcon = ({ item }: { item: { icon: string | null; name: string } }) => (item.icon ? <img className="item-icon" src={item.icon} alt="" loading="lazy" /> : <span className="slot-text">{item.name}</span>);

// The Targets views' budget: what 1% final damage is worth spending (billions; presets or typed, a typed
// one used when the box is left).
export function BudgetBox({ budget, onBudget }: { budget: number; onBudget: (meso: number) => void }) {
  const [text, setText] = useState(String(budget / 1e9));
  useEffect(() => setText(String(budget / 1e9)), [budget]);
  const commit = () => {
    const meso = budgetFrom(text);
    if (meso !== null) onBudget(meso);
    else setText(String(budget / 1e9));
  };
  return (
      <div className="row">
        <label className="small muted">
          Spend up to{" "}
          <input className="text-input count" type="number" step="any" min={0} aria-label="Budget (billions per 1% final damage)" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />B per 1% final damage
        </label>
        <div className="segmented" role="group" aria-label="Budgets">
          {BUDGET_PRESETS.map((b) => (
            <button key={b} type="button" aria-pressed={budget === b * 1e9} onClick={() => onBudget(b * 1e9)}>
              {b}B
            </button>
          ))}
        </div>
      </div>
  );
}

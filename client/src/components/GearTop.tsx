import { worldName } from "@miku/shared";
import { useState } from "react";
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
export function GearTop({ world, onWorld, characters, current, onPick }: { world: number; onWorld: (w: number) => void; characters: GearCharacter[] | undefined; current: GearCharacter | undefined; onPick: (id: number) => void }) {
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

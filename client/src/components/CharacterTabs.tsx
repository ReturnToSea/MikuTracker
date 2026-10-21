import { type KeyboardEvent, useEffect, useState } from "react";
import type { CharacterView } from "../api/types";
import { moveBy, moveTo, sameOrder } from "../lib/order";
import { Avatar } from "./Avatar";

// The characters of a world as tabs: click to select; drag left and right (or Alt + ←/→) to
// reorder. While dragging, the tabs move as you go; the new order is saved when you let go.
export function CharacterTabs({
  characters,
  selectedId,
  onSelect,
  onReorder,
}: {
  characters: CharacterView[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onReorder: (ids: number[]) => void;
}) {
  const saved = characters.map((c) => c.id);
  // A new order shown right away while it's dragged and saved; the server's order replaces it
  // as soon as that changes.
  const [draft, setDraft] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const savedKey = String(saved); // "1,2,3": changes whenever the server's order does
  useEffect(() => setDraft(null), [savedKey]);
  const order = draft ?? saved;

  const byId = new Map(characters.map((c) => [c.id, c]));
  const save = (next: number[]) => {
    setDraft(next);
    if (!sameOrder(next, saved)) onReorder(next);
  };

  function onKeyDown(e: KeyboardEvent, id: number) {
    if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    save(moveBy(order, id, e.key === "ArrowLeft" ? -1 : 1));
  }

  return (
    <div className="strip" role="tablist" aria-label="Characters">
      {order.map((id) => {
        const c = byId.get(id)!;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            className={`ctab${dragging === id ? " dragging" : ""}`}
            aria-selected={id === selectedId}
            draggable
            onClick={() => onSelect(id)}
            onKeyDown={(e) => onKeyDown(e, id)}
            onDragStart={(e) => {
              setDragging(id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragging === null) return;
              e.preventDefault();
              setDraft(moveTo(order, dragging, id));
            }}
            onDragEnd={() => {
              setDragging(null);
              save(order);
            }}
          >
            <Avatar src={c.avatar} size={38} name={c.name} />
            <span>
              <b>{c.name}</b>
              <small>
                Lv. {c.level} · {c.job}
              </small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

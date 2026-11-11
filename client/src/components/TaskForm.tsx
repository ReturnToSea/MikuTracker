import { type CustomTaskInput, LIMIT_SCOPES, TASK_CATEGORIES, TASK_RESETS, WEEKLY_RESET_DAY, WORLDS } from "@miku/shared";
import { useEffect, useRef, useState } from "react";
import type { TaskView } from "../api/types";
import { CATEGORY_NAMES, taskForm, toggleWorld, WEEKDAYS, withReset } from "../lib/checklist";

interface Props {
  task: TaskView | null; // the custom task being changed, or null for a new one
  world: number; // the world being looked at: a new task's to start with
  saving: boolean;
  error: string | null;
  onSave: (task: CustomTaskInput) => void;
  onDelete: () => void;
  onClose: () => void;
}

const RESET_NAMES = { daily: "Daily", weekly: "Weekly", none: "No reset" };
const SCOPE_NAMES = { character: "Per character", world: "Per world", account: "Per account" };

// A row of buttons choosing one of `options`.
function Choice<T extends string>({ label, options, value, names, onChange }: { label: string; options: readonly T[]; value: T; names: (o: T) => string; onChange: (o: T) => void }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === value} onClick={() => onChange(o)}>
          {names(o)}
        </button>
      ))}
    </div>
  );
}

// Making or changing your own task: name, category, reset, worlds and limit.
export function TaskForm({ task, world, saving, error, onSave, onDelete, onClose }: Props) {
  const [f, setF] = useState<CustomTaskInput>(() => taskForm(task ?? undefined, world));
  // The count as typed (it may be empty while typing); a whole number of at least 1 when saved.
  // Over 50 (the server's limit), the browser itself refuses to send the form (max={50}).
  const [count, setCount] = useState(String(f.limitCount));
  const limitCount = Math.max(1, Math.floor(Number(count) || 1));
  const box = useRef<HTMLFormElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.querySelector("input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <div className="modal-back top" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal block task-form"
        role="dialog"
        aria-modal="true"
        aria-label={task ? `Change ${task.name}` : "New task"}
        ref={box}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...f, limitCount });
        }}
      >
        <div className="modal-head">
          <div className="section-head">
            <h2>{task ? "Change task" : "New task"}</h2>
            <div className="tools-inline">
              {task && (
                <button type="button" className="danger-link" onClick={onDelete}>
                  Delete
                </button>
              )}
              <button type="button" className="btn quiet" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Saving…" : task ? "Save" : "Add task"}
              </button>
            </div>
          </div>
          <p className="muted small">Made once, it shows in every character's planning menu on the worlds you pick.</p>
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="form-grid">
          <label htmlFor="task-name">Name</label>
          <input id="task-name" className="text-input" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <span>Category</span>
          <Choice label="Category" options={TASK_CATEGORIES} value={f.category} names={(o) => CATEGORY_NAMES[o]} onChange={(category) => setF({ ...f, category })} />
          <span>Resets</span>
          <div className="tools-inline">
            <Choice label="Resets" options={TASK_RESETS} value={f.reset} names={(o) => RESET_NAMES[o]} onChange={(r) => setF(withReset(f, r))} />
            {f.reset === "weekly" && (
              <label className="small muted">
                on{" "}
                <select aria-label="Reset day" value={f.weekday ?? WEEKLY_RESET_DAY} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>{" "}
                at 00:00 UTC
              </label>
            )}
          </div>
          <span>Worlds</span>
          {/* Several at once: each world clicked on or off (one stays on). */}
          <div className="segmented" role="group" aria-label="Worlds">
            {WORLDS.map((w) => (
              <button key={w.id} type="button" aria-pressed={f.worlds.includes(w.id)} onClick={() => setF({ ...f, worlds: toggleWorld(f.worlds, w.id) })}>
                {w.name}
              </button>
            ))}
          </div>
          <span>Limit</span>
          <div className="tools-inline">
            <Choice label="Limit" options={LIMIT_SCOPES} value={f.limitScope} names={(o) => SCOPE_NAMES[o]} onChange={(limitScope) => setF({ ...f, limitScope })} />
            {f.limitScope !== "character" && (
              <label className="small muted">
                at most{" "}
                <input type="number" className="text-input count" aria-label="Characters per period" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} />{" "}
                {limitCount === 1 ? "character" : "characters"} each {f.reset === "weekly" ? "week" : f.reset === "daily" ? "day" : "time"}
              </label>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

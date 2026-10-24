import { useEffect, useRef, useState } from "react";
import type { ChecklistCharacter, TaskView } from "../api/types";
import { byCategory, CATEGORY_NAMES, limitText, offDay, resetText, togglePlanned } from "../lib/checklist";

interface Props {
  c: ChecklistCharacter;
  tasks: TaskView[];
  saving: boolean;
  error: string | null;
  onSave: (tasks: string[]) => void;
  onClose: () => void;
  onNewTask: () => void;
  onEditTask: (t: TaskView) => void;
}

const SECTIONS = [
  ["daily", "Daily · 00:00 UTC"],
  ["weekly", "Weekly"],
  ["none", "One-off · no reset"],
] as const;

// The planning menu: every task as a box in two columns, by reset and category. Levels are a
// reminder only. Nothing is saved until Save.
export function ChecklistPlanner({ c, tasks, saving, error, onSave, onClose, onNewTask, onEditTask }: Props) {
  const [plan, setPlan] = useState<string[]>(c.plan);
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      // the task form, opened on top, handles its own Escape
      if (e.key === "Escape" && !document.querySelector(".task-form")) close.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const count = (reset: string) => tasks.filter((t) => t.reset === reset && plan.includes(t.id)).length;

  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal block" role="dialog" aria-modal="true" aria-labelledby="plan-title" tabIndex={-1} ref={box}>
        <div className="modal-head">
          <div className="section-head">
            <h2 id="plan-title">Plan tasks · {c.name}</h2>
            <div className="tools-inline">
              <button type="button" className="btn quiet" onClick={onNewTask}>
                New task…
              </button>
              <button type="button" className="btn quiet" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn" disabled={saving} onClick={() => onSave(tasks.filter((t) => plan.includes(t.id)).map((t) => t.id))}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
          <p className="muted small">
            {count("daily")} daily · {count("weekly")} weekly · {count("none")} one-off. Tick the tasks {c.name} does; levels are shown as a reminder.
          </p>
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
        </div>
        {SECTIONS.map(([reset, title]) => {
          const groups = byCategory(tasks, reset);
          if (groups.length === 0) return null;
          return (
            <section key={reset} aria-label={title}>
              <h3 className="range-name">{title}</h3>
              {groups.map((g) => (
                <div key={g.category} className="task-group">
                  <h4 className="small muted">{CATEGORY_NAMES[g.category]}</h4>
                  <div className="pick-grid">
                    {g.tasks.map((t) => {
                      const on = plan.includes(t.id);
                      const high = t.level !== null && t.level > c.level;
                      return (
                        <div key={t.id} className={`pick${on ? " on" : ""}`}>
                          <label>
                            <input type="checkbox" checked={on} onChange={() => setPlan(togglePlanned(plan, t.id))} aria-label={`Plan ${t.name}`} />
                            <span className="task-name">{t.name}</span>
                            {t.level !== null && <span className={`lv${high ? " warning" : ""}`}>{t.level}+{high ? ` (above Lv. ${c.level})` : ""}</span>}
                            {offDay(t) && <span className="lv">{offDay(t)}</span>}
                          </label>
                          <span className="badges">
                            {t.limit && <span className="lim">{limitText(t.limit)}</span>}
                            {t.custom && (
                              <>
                                <span className="cust">custom</span>
                                <button type="button" className="link-btn small" onClick={() => onEditTask(t)} aria-label={`Change ${t.name}`} title={resetText(t)}>
                                  Edit
                                </button>
                              </>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

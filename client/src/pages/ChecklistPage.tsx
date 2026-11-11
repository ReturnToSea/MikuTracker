import { worldName } from "@miku/shared";
import { useState } from "react";
import { keys, useChecklist, useDeleteCustomTask, useRefreshStatus, useSaveChecklistPlan, useSaveCustomTask, useSetTaskDone, useSettings, useUpdateSettings } from "../api/hooks";
import type { ChecklistBoard, ChecklistCharacter, TaskView } from "../api/types";
import { Avatar } from "../components/Avatar";
import { ChecklistPlanner } from "../components/ChecklistPlanner";
import { TaskForm } from "../components/TaskForm";
import { useResetClock } from "../components/useResetClock";
import { WorldSwitcher } from "../components/WorldSwitcher";
import { resetLocal, untilReset } from "../lib/bosses";
import { byCategory, CATEGORY_NAMES, doneCount, limitState, limitText, offDay } from "../lib/checklist";

// One task row: a box (off when another character used up its limit), its name and level, and
// its limit or "custom" badge.
function TaskRow({ b, c, t, onTick }: { b: ChecklistBoard; c: ChecklistCharacter; t: TaskView; onTick: (done: boolean) => void }) {
  const done = c.done.includes(t.id);
  const { users, blocked } = limitState(b, c, t);
  return (
    <label className={`task-row${done ? " done" : ""}${blocked ? " blocked" : ""}`} title={blocked ? `Done by ${users.join(", ")}` : undefined}>
      <input type="checkbox" checked={done} disabled={blocked} onChange={(e) => onTick(e.target.checked)} aria-label={`${t.name} done`} />
      <span>
        <span className="task-name">{t.name}</span>
        {t.level !== null && <span className="lv">{t.level}+</span>}
        {offDay(t) && <span className="lv">resets {offDay(t)}</span>}
      </span>
      <span className="badges">
        {blocked ? <span className="small muted">done by {users.join(", ")}</span> : t.limit ? <span className="lim">{limitText(t.limit)}</span> : null}
        {t.custom && <span className="cust">custom</span>}
      </span>
    </label>
  );
}

// The checklist tab (layout C): one character at a time, its dailies and weeklies side by side by
// category, and a side panel with the resets and who used the limited tasks.
export function ChecklistPage() {
  const settings = useSettings();
  const world = settings.data?.worldId ?? 45;
  const saveSettings = useUpdateSettings();
  const board = useChecklist(world);
  const savePlan = useSaveChecklistPlan();
  const saveTask = useSaveCustomTask();
  const deleteTask = useDeleteCustomTask();
  const setDone = useSetTaskDone(world);
  useRefreshStatus(); // after each check of Nexon, levels and avatars load again
  const [picked, setPicked] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [form, setForm] = useState<{ task: TaskView | null } | null>(null);

  const b = board.data;
  const resets = b ? [new Date(b.daily.resetsAt), ...b.tasks.flatMap((t) => (t.resetsAt ? [new Date(t.resetsAt)] : []))] : [];
  const now = useResetClock(keys.checklist(world), resets);
  const c = b?.characters.find((x) => x.id === picked) ?? b?.characters[0];

  const column = (title: string, resets: TaskView["reset"][]) => {
    if (!b || !c) return null;
    const mine = b.tasks.filter((t) => c.plan.includes(t.id));
    const [done, total] = resets.reduce(([d, n], r) => { const [x, y] = doneCount(c, b.tasks, r); return [d + x, n + y]; }, [0, 0]);
    return (
      <section className="block checklist-col" aria-label={title}>
        <div className="section-head">
          <h2>{title}</h2>
          <span className="muted small">
            {done} / {total}
          </span>
        </div>
        {total === 0 && <p className="muted small">Nothing planned.</p>}
        {resets.map((r) =>
          byCategory(mine, r).map((g) => (
            <div key={r + g.category} className="task-group">
              <h3 className="range-name">{r === "none" ? `One-off · ${CATEGORY_NAMES[g.category]}` : CATEGORY_NAMES[g.category]}</h3>
              {g.tasks.map((t) => (
                <TaskRow key={t.id} b={b} c={c} t={t} onTick={(d) => setDone.mutate({ id: c.id, task: t.id, done: d })} />
              ))}
            </div>
          )),
        )}
      </section>
    );
  };

  return (
    <>
      <h1 className="visually-hidden">Checklist</h1>
      <section className="block top">
        <div className="page-head">
          <WorldSwitcher world={world} onChange={(w) => { setDone.reset(); saveSettings.mutate({ worldId: w }); }} />
          <div className="tools-inline">
            <button type="button" className="btn quiet" disabled={!c} onClick={() => { savePlan.reset(); setPlanning(true); }}>
              Plan tasks…
            </button>
            <button type="button" className="btn quiet" onClick={() => { saveTask.reset(); deleteTask.reset(); setForm({ task: null }); }}>
              New task…
            </button>
          </div>
        </div>
        {b && b.characters.length > 0 && (
          <div className="strip" role="tablist" aria-label="Characters">
            {b.characters.map((x) => {
              const [dd, dt] = doneCount(x, b.tasks, "daily");
              const [wd, wt] = doneCount(x, b.tasks, "weekly");
              return (
                <button key={x.id} type="button" role="tab" className="ctab" aria-selected={x.id === c?.id} onClick={() => { setDone.reset(); setPicked(x.id); }}>
                  <Avatar src={x.avatar} size={36} name={x.name} />
                  <span>
                    <b>{x.name}</b>
                    <small>
                      D {dd}/{dt} · W {wd}/{wt}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
      {setDone.isError && (
        <p className="error block" role="alert">
          {setDone.error.message}
        </p>
      )}
      {board.isError && (
        <p className="error block" role="alert">
          Couldn't load the checklist: {board.error.message}
        </p>
      )}
      {board.isPending && <p className="notice muted block">Loading…</p>}
      {b?.characters.length === 0 && (
        <section className="block">
          <p className="notice muted">No characters on {worldName(world)} yet. Add them on Home first.</p>
        </section>
      )}
      {b && c && (
        <div className="checklist">
          {column("Daily", ["daily"])}
          {column("Weekly", ["weekly", "none"])}
          <aside className="block checklist-side" aria-label={worldName(world)}>
            <h2>{worldName(world)}</h2>
            <p className="small countdown">
              Daily reset in <b>{untilReset(now, new Date(b.daily.resetsAt))}</b>
              <br />
              <span className="muted">{resetLocal(new Date(b.daily.resetsAt))} your time</span>
            </p>
            <p className="small countdown">
              Weekly reset in <b>{untilReset(now, new Date(b.weekly.resetsAt))}</b>
              <br />
              <span className="muted">{resetLocal(new Date(b.weekly.resetsAt))} your time</span>
            </p>
            <h3 className="range-name">Limited tasks</h3>
            <div className="limits">
              {b.tasks
                .filter((t) => t.limit)
                .map((t) => {
                  const users = b.limits.find((l) => l.task === t.id)?.users ?? [];
                  const full = users.length >= t.limit!.count;
                  return (
                    <div key={t.id} className="limit-row small">
                      <span>{t.name}</span>
                      <span className={full ? "warning" : "muted"}>
                        {users.length}/{t.limit!.count} per {t.limit!.scope}
                        {users.length > 0 && ` · ${users.join(", ")}`}
                      </span>
                    </div>
                  );
                })}
            </div>
            <p className="tiny muted">Presets as of {b.patch}.</p>
          </aside>
        </div>
      )}
      {b && c && planning && (
        <ChecklistPlanner
          c={c}
          tasks={b.tasks}
          saving={savePlan.isPending}
          error={savePlan.error?.message ?? null}
          onSave={(tasks) => savePlan.mutate({ id: c.id, tasks }, { onSuccess: () => setPlanning(false) })}
          onClose={() => setPlanning(false)}
          onNewTask={() => { saveTask.reset(); deleteTask.reset(); setForm({ task: null }); }}
          onEditTask={(t) => { saveTask.reset(); deleteTask.reset(); setForm({ task: t }); }}
        />
      )}
      {form && (
        <TaskForm
          task={form.task}
          world={world}
          saving={saveTask.isPending || deleteTask.isPending}
          error={(saveTask.error ?? deleteTask.error)?.message ?? null}
          onSave={(task) => saveTask.mutate({ id: form.task?.id ?? null, task }, { onSuccess: () => setForm(null) })}
          onDelete={() => {
            if (form.task && window.confirm(`Delete ${form.task.name}? It comes off every character's checklist.`)) deleteTask.mutate(form.task.id, { onSuccess: () => setForm(null) });
          }}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

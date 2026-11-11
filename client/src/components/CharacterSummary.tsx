import { characterName, levelInput, MAX_LEVEL, worldName } from "@miku/shared";
import { type FormEvent, useState } from "react";
import { useEditCharacter } from "../api/hooks";
import type { CharacterView } from "../api/types";
import { levelProgress } from "../lib/characters";
import { fmtInt } from "../lib/format";
import { Avatar } from "./Avatar";

// The selected character: who it is, its level and progress, ranks and Legion. One added by hand
// (Challenger, v4.2.0) has only its name, class and level, which can be changed here.
export function CharacterSummary({ c, onDelete }: { c: CharacterView; onDelete: () => void }) {
  const world = worldName(c.worldId);
  const progress = levelProgress(c);
  if (c.byHand) return <ByHandSummary c={c} world={world} onDelete={onDelete} />;
  return (
    <section className="block" aria-label={c.name}>
      {c.missingSince && (
        <p className="notice-line" role="status">
          Not found in Nexon's rankings since {new Date(c.missingSince).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} (renamed, or no longer ranked). Showing its last saved numbers.
        </p>
      )}
      <div className="hero">
        <Avatar src={c.avatar} size={104} name={c.name} />
        <div className="who">
          <h2>{c.name}</h2>
          <div className="meta">
            {c.job} · {world}
          </div>
          {progress ? (
            <>
              <div className="expbar" role="progressbar" aria-label={`EXP into level ${c.level}`} aria-valuenow={Number(progress.percent.toFixed(2))} aria-valuemin={0} aria-valuemax={100}>
                <div style={{ width: `${progress.percent}%` }} />
              </div>
              <small className="muted">
                {progress.text} to level {c.level + 1} ·{" "}
                <b className="exp-have">
                  {progress.have} / {progress.need} EXP
                </b>
              </small>
            </>
          ) : (
            <small className="muted">Level {MAX_LEVEL}: the highest level.</small>
          )}
        </div>
        <div className="level-box">
          <div className="muted small">Level</div>
          <div className="level">{c.level}</div>
        </div>
      </div>
      <div className="stats">
        <div className="stat">
          <div className="label">{world} rank</div>
          <div className="value">{c.worldRank === null ? "—" : `#${fmtInt(c.worldRank)}`}</div>
        </div>
        <div className="stat">
          <div className="label">Overall rank</div>
          <div className="value">{c.overallRank === null ? "—" : `#${fmtInt(c.overallRank)}`}</div>
          <div className="muted small">all NA worlds</div>
        </div>
        <div className="stat">
          <div className="label">{world} Legion</div>
          <div className="value">{c.legion ? fmtInt(c.legion.level) : "N/A"}</div>
          <LegionSource legion={c.legion} name={c.name} />
        </div>
        <div className="stat">
          <div className="label">Raid power</div>
          <div className="value">{c.legion ? fmtInt(c.legion.raidPower) : "N/A"}</div>
        </div>
      </div>
      <div className="page-foot">
        <button type="button" className="danger-link" onClick={onDelete}>
          Delete {c.name}…
        </button>
      </div>
    </section>
  );
}

// A character added by hand: no EXP, ranks or Legion (Nexon doesn't list it), and its level and name
// changed here.
function ByHandSummary({ c, world, onDelete }: { c: CharacterView; world: string | undefined; onDelete: () => void }) {
  const edit = useEditCharacter();
  const [renaming, setRenaming] = useState(false);
  return (
    <section className="block" aria-label={c.name}>
      <div className="hero">
        <Avatar src={c.avatar} size={104} name={c.name} />
        <div className="who">
          {renaming ? <RenameForm c={c} edit={edit} onDone={() => setRenaming(false)} /> : <h2>{c.name}</h2>}
          <div className="meta">
            {c.job} · {world}
          </div>
        </div>
        <div className="level-box">
          <div className="muted small">Level</div>
          <div className="level">{c.level}</div>
          <LevelEdit c={c} edit={edit} />
        </div>
      </div>
      {edit.isError && <p className="error" role="alert">{edit.error.message}</p>}
      <div className="page-foot">
        {!renaming && (
          <button type="button" className="link-button" onClick={() => { edit.reset(); setRenaming(true); }}>
            Rename…
          </button>
        )}
        <button type="button" className="danger-link" onClick={onDelete}>
          Delete {c.name}…
        </button>
      </div>
    </section>
  );
}

type Edit = ReturnType<typeof useEditCharacter>;

// "Change level" opens a box: a new level for today (a lower one than now asks first: "Save anyway").
function LevelEdit({ c, edit }: { c: CharacterView; edit: Edit }) {
  const [typed, setTyped] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (typed === null) {
    return (
      <button type="button" className="link-button" onClick={() => { edit.reset(); setTyped(String(c.level)); }}>
        Change level
      </button>
    );
  }
  const level = levelInput.safeParse(Number(typed));
  const lower = level.success && level.data < c.level;
  function save(e: FormEvent) {
    e.preventDefault();
    if (!level.success) return setProblem(`Levels are 1 to ${MAX_LEVEL}`);
    // (the same level: nothing to save, so no day is marked as typed)
    if (level.data === c.level) return setTyped(null);
    edit.mutate({ id: c.id, level: level.data }, { onSuccess: () => setTyped(null) });
  }
  return (
    <form className="level-edit" onSubmit={save}>
      <input aria-label="New level" inputMode="numeric" autoFocus value={typed} onChange={(e) => { setProblem(null); setTyped(e.target.value); }} />
      <button className="btn" type="submit" disabled={edit.isPending}>
        {edit.isPending ? "Saving…" : lower ? "Save anyway" : "Save"}
      </button>
      <button className="btn quiet" type="button" onClick={() => setTyped(null)}>
        Cancel
      </button>
      {lower && (
        <p className="warning small" role="alert">
          That's lower than {c.level}. Fixing a typo? It's saved as today's level.
        </p>
      )}
      {problem && <p className="error small" role="alert">{problem}</p>}
    </form>
  );
}

function RenameForm({ c, edit, onDone }: { c: CharacterView; edit: Edit; onDone: () => void }) {
  const [typed, setTyped] = useState(c.name);
  const [problem, setProblem] = useState<string | null>(null);
  function save(e: FormEvent) {
    e.preventDefault();
    const name = characterName.safeParse(typed);
    if (!name.success) return setProblem(name.error.issues[0]!.message);
    edit.mutate({ id: c.id, name: name.data }, { onSuccess: onDone });
  }
  return (
    <form className="rename" onSubmit={save}>
      <input aria-label="New name" autoFocus value={typed} onChange={(e) => { setProblem(null); setTyped(e.target.value); }} />
      <button className="btn" type="submit" disabled={edit.isPending}>
        {edit.isPending ? "Saving…" : "Save"}
      </button>
      <button className="btn quiet" type="button" onClick={onDone}>
        Cancel
      </button>
      {problem && <p className="error small" role="alert">{problem}</p>}
    </form>
  );
}

// Nexon lists a world's Legion under one character per account: say which, when it's another one,
// and why it's N/A before that character is added.
export function LegionSource({ legion, name }: { legion: { from: string } | null; name: string }) {
  if (!legion) return <div className="muted small">Add the character Nexon lists your Legion under to see it.</div>;
  if (legion.from === name) return null;
  return <div className="muted small">listed under {legion.from}</div>;
}

import { MAX_LEVEL, worldName } from "@miku/shared";
import type { CharacterView } from "../api/types";
import { levelProgress } from "../lib/characters";
import { fmtInt } from "../lib/format";
import { Avatar } from "./Avatar";

// The selected character: who it is, its level and progress, ranks and Legion. (The daily EXP
// chart and time to level arrive in v0.7.0.)
export function CharacterSummary({ c, onDelete }: { c: CharacterView; onDelete: () => void }) {
  const world = worldName(c.worldId);
  const progress = levelProgress(c);
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
          <div className="value">#{fmtInt(c.worldRank)}</div>
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

// Nexon lists a world's Legion under one character per account: say which, when it's another one,
// and why it's N/A before that character is added.
export function LegionSource({ legion, name }: { legion: { from: string } | null; name: string }) {
  if (!legion) return <div className="muted small">Add the character Nexon lists your Legion under to see it.</div>;
  if (legion.from === name) return null;
  return <div className="muted small">listed under {legion.from}</div>;
}

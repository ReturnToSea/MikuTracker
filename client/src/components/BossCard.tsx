import type { BossCharacter, BossInfo, BossRow } from "../api/types";
import { partyText } from "../lib/bosses";
import { fmtExp } from "../lib/format";
import { Avatar } from "./Avatar";
import { BossBanner } from "./BossBanner";

interface Props {
  c: BossCharacter;
  bosses: BossInfo[];
  limits: { perCharacter: number; perWorld: number };
  monthlyReset: string; // "Nov 1"
  onPlan: () => void;
  onTick: (boss: string, cleared: boolean) => void;
}

// One character on the Bosses tab: its planned bosses as a checklist, with its meso this week.
export function BossCard({ c, bosses, limits, monthlyReset, onPlan, onTick }: Props) {
  const info = (id: string) => bosses.find((b) => b.id === id)!;
  const overCharacter = c.weekly.filter((r) => r.over === "character").length;
  const overWorld = c.weekly.filter((r) => r.over === "world").length;
  const row = (r: BossRow) => (
    <label key={r.boss} className={`boss-row${r.cleared ? " done" : ""}${r.over ? " over" : ""}`}>
      <input type="checkbox" checked={r.cleared} onChange={(e) => onTick(r.boss, e.target.checked)} aria-label={`${info(r.boss).name} cleared`} />
      <BossBanner info={info(r.boss)} />
      <span className="boss-meta">
        <span className={`diff diff-${r.difficulty.toLowerCase()}`}>{r.difficulty}</span>
        <span className="muted small">{partyText(r.partySize)}</span>
      </span>
      <span className="boss-meso">{r.over ? <span className="warning small">not counted</span> : fmtExp(r.meso)}</span>
    </label>
  );

  return (
    <article className="boss-card block" aria-label={c.name}>
      <div className="boss-card-head">
        <Avatar src={c.avatar} size={40} name={c.name} />
        <div className="who">
          <h2>{c.name}</h2>
          <div className="muted small">
            Lv. {c.level} · {c.job}
          </div>
        </div>
        <button type="button" className="btn quiet" onClick={onPlan}>
          Plan bosses…
        </button>
      </div>
      {c.weekly.length + c.monthly.length === 0 ? (
        <p className="muted small boss-empty">No bosses planned yet.</p>
      ) : (
        <>
          <div className="boss-card-sum small">
            <span className="muted">
              {c.cleared} / {c.weekly.length} cleared
            </span>
            <span>
              <b>{fmtExp(c.soFar)}</b> <span className="muted">of {fmtExp(c.planned)}</span>
            </span>
          </div>
          <div className="boss-progress">
            <div style={{ width: `${c.weekly.length ? (c.cleared / c.weekly.length) * 100 : 0}%` }} />
          </div>
          <div className="boss-rows">{c.weekly.map(row)}</div>
          {overCharacter > 0 && (
            <p className="warning small">
              {overCharacter} over the {limits.perCharacter}-crystal limit: the least valuable {overCharacter === 1 ? "one doesn't" : "ones don't"} count.
            </p>
          )}
          {overWorld > 0 && (
            <p className="warning small">
              {overWorld} over the world's {limits.perWorld}-crystal limit: {overWorld === 1 ? "it doesn't" : "they don't"} count.
            </p>
          )}
          {c.monthly.length > 0 && (
            <div className="boss-monthly">
              <div className="range-name">Monthly · resets {monthlyReset}</div>
              <div className="boss-rows">{c.monthly.map(row)}</div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

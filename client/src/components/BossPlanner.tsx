import { useEffect, useRef, useState } from "react";
import type { BossCharacter, BossInfo } from "../api/types";
import { entryMeso, inGameOrder, partyText, type PlanEntry, planSummary, setDifficulty, stepParty, toggleBoss } from "../lib/bosses";
import { fmtExp } from "../lib/format";
import { BossBanner } from "./BossBanner";

interface Props {
  c: BossCharacter;
  bosses: BossInfo[];
  perCharacter: number;
  saving: boolean;
  error: string | null;
  onSave: (plan: PlanEntry[]) => void;
  onClose: () => void;
}

// The planning menu: every boss in game order as a card, 2 per row, monthly ones last. Ticking a
// card adds the boss; then its difficulty and party size are picked. Nothing is saved until Save.
export function BossPlanner({ c, bosses, perCharacter, saving, error, onSave, onClose }: Props) {
  const [plan, setPlan] = useState<PlanEntry[]>(() => [...c.weekly, ...c.monthly].map(({ boss, difficulty, partySize }) => ({ boss, difficulty, partySize })));
  const sum = planSummary(plan, bosses, perCharacter);
  const box = useRef<HTMLDivElement>(null);

  const close = useRef(onClose);
  close.current = onClose;

  // Opens with the focus inside the menu; Escape closes it without saving.
  useEffect(() => {
    box.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const card = (info: BossInfo) => {
    const entry = plan.find((p) => p.boss === info.id);
    const shown = entry ?? { boss: info.id, difficulty: info.difficulties[0]!.difficulty, partySize: 1 };
    const most = info.difficulties.find((d) => d.difficulty === shown.difficulty)!.maxParty;
    return (
      <div key={info.id} className={`plan-card${entry ? " on" : ""}`} role="group" aria-label={info.name}>
        <label className="plan-pick">
          <input type="checkbox" checked={Boolean(entry)} onChange={() => setPlan(toggleBoss(plan, info))} aria-label={`Plan ${info.name}`} />
          <BossBanner info={info} big />
          <span className="plan-meso">{fmtExp(entryMeso(shown, info))}</span>
        </label>
        <fieldset className="plan-controls" disabled={!entry}>
          <div className="plan-diffs" role="group" aria-label="Difficulty">
            {info.difficulties.map((d) => (
              <button key={d.difficulty} type="button" aria-pressed={d.difficulty === shown.difficulty} onClick={() => setPlan(setDifficulty(plan, info, d.difficulty))}>
                {d.difficulty}
              </button>
            ))}
          </div>
          <div className="plan-party">
            <button type="button" aria-label="Fewer people" onClick={() => setPlan(stepParty(plan, info, -1))} disabled={shown.partySize <= 1}>
              −
            </button>
            <span>{partyText(shown.partySize)}</span>
            <button type="button" aria-label="More people" onClick={() => setPlan(stepParty(plan, info, 1))} disabled={shown.partySize >= most}>
              +
            </button>
            <span className="muted small">{most < 6 ? `party max ${most} · ` : ""}per person</span>
          </div>
        </fieldset>
      </div>
    );
  };

  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal block" role="dialog" aria-modal="true" aria-labelledby="plan-title" tabIndex={-1} ref={box}>
        <div className="modal-head">
          <div className="section-head">
            <h2 id="plan-title">Plan bosses · {c.name}</h2>
            <div className="tools-inline">
              <button type="button" className="btn quiet" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn" disabled={saving} onClick={() => onSave(inGameOrder(plan, bosses))}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
          <div className="section-head small">
            <span>
              {sum.weekly} weekly {sum.weekly === 1 ? "boss" : "bosses"}
              {sum.over > 0 ? (
                <span className="warning">
                  {" "}
                  · {sum.over} over the {perCharacter}-crystal limit (the least valuable won't count)
                </span>
              ) : (
                <span className="muted"> · up to {perCharacter} count</span>
              )}
            </span>
            <span>
              Planned: <b>{fmtExp(sum.planned)}</b> a week{sum.monthly > 0 && <> · <b>{fmtExp(sum.monthly)}</b> a month</>}
            </span>
          </div>
          {error && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
        </div>
        <h3 className="range-name">Weekly · game order</h3>
        <div className="plan-grid">{bosses.filter((b) => b.kind === "weekly").map(card)}</div>
        <h3 className="range-name">Monthly</h3>
        <div className="plan-grid">{bosses.filter((b) => b.kind === "monthly").map(card)}</div>
      </div>
    </div>
  );
}

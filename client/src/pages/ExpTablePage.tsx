import { type FormEvent, useState } from "react";
import { useExpTable } from "../api/hooks";
import { DEFAULT_RANGE, EXP_RANGES, type ExpRangeId, jumpLevel, rangeFor, rangeOf, rowsIn } from "../lib/expTable";
import { fmtChange, fmtExp, fmtInt } from "../lib/format";

// The row jumped to is brought into view when it appears.
const scrollToRow = (row: HTMLTableRowElement | null) => row?.scrollIntoView({ block: "center" });

// The GMS EXP table: reference only, not tied to any character.
export function ExpTablePage() {
  const table = useExpTable();
  const [range, setRange] = useState<ExpRangeId>(DEFAULT_RANGE);
  const [jump, setJump] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [badJump, setBadJump] = useState(false);

  function onJump(e: FormEvent) {
    e.preventDefault();
    const level = jumpLevel(typed);
    setBadJump(level === null);
    if (level === null) return;
    const shown = rangeOf(range);
    if (level < shown.from || level > shown.to) setRange(rangeFor(level));
    setJump(level);
  }

  return (
    <>
      <section className="block">
        <div className="section-head">
          <h1 className="page-title">EXP table (GMS)</h1>
          {table.data && (
            <span className="muted small">
              Current as of <b>{table.data.patch}</b> ({table.data.date})
            </span>
          )}
        </div>
        <p className="muted">EXP needed to reach the next level. Levels 210–259 include v.271's reduction (about 8% at 210 up to 58% at 250–259).</p>
        <div className="tools">
          <div className="segmented" role="group" aria-label="Levels">
            {EXP_RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={r.id === range}
                onClick={() => {
                  setRange(r.id);
                  setJump(null);
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <form className="search" onSubmit={onJump}>
            <input type="text" inputMode="numeric" aria-label="Jump to level" placeholder="Jump to level" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="btn" type="submit">
              Go
            </button>
          </form>
        </div>
        {badJump && (
          <p className="error" role="alert">
            Enter a level from 1 to 299.
          </p>
        )}
      </section>

      <section className="block table-block">
        {table.isPending && <p className="notice muted">Loading…</p>}
        {table.isError && (
          <p className="notice error" role="alert">
            Couldn't load the EXP table: {table.error.message}
          </p>
        )}
        {table.data && (
          <table className="exp-table">
            <thead>
              <tr>
                <th>Level</th>
                <th className="num">EXP to next level</th>
                <th className="num">Short</th>
                <th className="num">Change</th>
                <th className="num">Total from level 1</th>
              </tr>
            </thead>
            <tbody>
              {rowsIn(table.data.rows, range).map((row) => {
                const before = table.data.rows[row.level - 2];
                const change = before ? row.expToNext / before.expToNext - 1 : null;
                return (
                  <tr key={row.level} id={`level-${row.level}`} aria-current={row.level === jump ? "true" : undefined} ref={row.level === jump ? scrollToRow : undefined}>
                    <td>
                      <b>{row.level}</b> → {row.level + 1}
                    </td>
                    <td className="num">{fmtInt(row.expToNext)}</td>
                    <td className="num short">{fmtExp(row.expToNext)}</td>
                    <td className={`num${change !== null && change >= 1 ? " big" : ""}`}>{before ? fmtChange(before.expToNext, row.expToNext) : "—"}</td>
                    <td className="num">{fmtExp(row.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <p className="muted small footnote">
        Source: whackybeanz.com "Everything EXP" (its MapleSEA / KMS / TMS table), checked against Nexon's GMS v.271 patch notes and Namu Wiki.
      </p>
    </>
  );
}

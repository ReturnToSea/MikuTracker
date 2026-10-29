import type { UpgradeStep } from "../api/types";
import { formatMeso } from "../lib/flames";
import { along, decades, formatTick, SAME_PER_FD, SYSTEM_NAME } from "../lib/upgrades";

// The Upgrades page's chart: every step as a dot, its average cost (across) against the final damage it
// adds (up), both on scales of tens, coloured by system; the dashed lines are the same meso per 1% final
// damage (up and left is better). Clicking a dot picks that step.
const W = 1000;
const H = 440;
const L = 56;
const R = 26;
const T = 14;
const B = 40;

export function UpgradesChart({ steps, picked, onPick }: { steps: UpgradeStep[]; picked: number; onPick: (i: number) => void }) {
  const xs = decades(steps.map((s) => s.cost));
  const ys = decades(steps.map((s) => s.fd));
  // (a free step, at a Black Flame price of 0, sits at the scale's start rather than off the chart)
  const X = (v: number) => L + along(xs, Math.max(v, 10 ** xs[0])) * (W - L - R);
  const Y = (v: number) => H - B - along(ys, Math.max(v, 10 ** ys[0])) * (H - T - B);
  const powers = (d: [number, number]) => Array.from({ length: d[1] - d[0] + 1 }, (_, i) => 10 ** (d[0] + i));
  const first = 10 ** xs[0];
  const last = 10 ** xs[1];
  return (
    <div className="upgrades-chart">
      {/* (a narrow window scrolls the chart rather than shrinking its text) */}
      <div className="table-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cost against final damage">
          {powers(xs).map((v) => (
            <g key={`x${v}`}>
              <line className="grid-line" x1={X(v)} x2={X(v)} y1={T} y2={H - B} />
              <text className="axis" x={X(v)} y={H - B + 16} textAnchor="middle">
                {formatMeso(v)}
              </text>
            </g>
          ))}
          {powers(ys).map((v) => (
            <g key={`y${v}`}>
              <line className="grid-line" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
              <text className="axis" x={L - 6} y={Y(v) + 4} textAnchor="end">
                {formatTick(v)}
              </text>
            </g>
          ))}
          <defs>
            <clipPath id="upgrades-plot">
              <rect x={L} y={T} width={W - L - R} height={H - T - B} />
            </clipPath>
          </defs>
          {SAME_PER_FD.map((k) => (
            <g key={k} clipPath="url(#upgrades-plot)">
              <line className="same" x1={X(first)} y1={Y(first / k)} x2={X(last)} y2={Y(last / k)} />
              <text className="same-label" x={X(Math.min(last, (k * 10 ** ys[1]) / 1.6)) - 4} y={Y(Math.min(last, (k * 10 ** ys[1]) / 1.6) / k) + 12} textAnchor="end">
                {formatMeso(k)} per 1%
              </text>
            </g>
          ))}
          <text className="axis" x={(W + L) / 2} y={H - 6} textAnchor="middle">
            cost of the step (average)
          </text>
          <text className="axis" transform={`translate(12 ${(H - B) / 2}) rotate(-90)`} textAnchor="middle">
            final damage it adds
          </text>
          {steps.map((s, i) => (
            <circle key={`${s.system}-${s.slot}`} className={`dot sys-${s.system}${i === picked ? " picked" : ""}`} cx={X(s.cost)} cy={Y(s.fd)} r={i === picked ? 7 : 5} onClick={() => onPick(i)}>
              <title>
                {s.name}: {s.step}, {formatMeso(s.perFd)} per 1%
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="legend">
        {(["starforce", "flames", "potential"] as const).map((sys) => (
          <span key={sys}>
            <i className={`sys-${sys}`} />
            {SYSTEM_NAME[sys]}
          </span>
        ))}
      </div>
    </div>
  );
}

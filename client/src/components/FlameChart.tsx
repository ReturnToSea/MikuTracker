import { useMemo, useRef, useState } from "react";
import type { FlameGraph } from "../api/types";
import { atLeast, chanceTick, formatChance, formatMeso, formatScore, pointAt } from "../lib/flames";

export type ChartMode = "dist" | "cost" | "gain";
export const CHART_MODES: [ChartMode, string][] = [
  ["dist", "Distribution"],
  ["cost", "Cost curve (+1 score)"],
  ["gain", "E[Gain] curve"],
];

// The graph for one item: one series at a time, the current score marked. Distribution: every score a
// flame can give (no grouping), dim up to the current score and accent past it; the curves: what a
// flame adds on average, and the meso per point it costs, from each score. Hovering shows the point's
// values (on the distribution, the tallest point near the pointer, so spikes are easy to hit). The
// Potential page uses it too (v2.3.0), per cube instead of per flame, where clicking the distribution
// picks a target score, marked on it.
const W = 720;
const H = 240;
const L = 58;
const R = 12;
const T = 12;
const B = 30;

export function FlameChart({ graph, current, mode, per = "flame", target = null, onPick }: { graph: FlameGraph; current: number; mode: ChartMode; per?: string; target?: number | null; onPick?: (score: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  // the score under the pointer (a target can be any score, not only one a roll gives)
  const under = useRef<number | null>(null);
  const dist = graph.distribution;
  const atLeastOf = useMemo(() => atLeast(dist), [dist]);

  const points: [number, number | null][] =
    mode === "dist" ? dist : mode === "gain" ? graph.curves.map((p) => [p.score, p.gain]) : graph.curves.map((p) => [p.score, p.mesoPerScore]);
  const xmax = Math.max(current, points.at(-1)?.[0] ?? 0, 1);
  // the cost climbs without end near the top: the scale stops at its value at 85% of the way
  const values = points.map((p) => p[1]).filter((v): v is number => v !== null);
  const cap = mode === "cost" ? (graph.curves[Math.floor(graph.curves.length * 0.85)]?.mesoPerScore ?? Math.max(...values)) : Math.max(...values, 0);
  const ymax = cap > 0 ? cap : 1;
  const X = (v: number) => L + (v / xmax) * (W - L - R);
  const Y = (v: number) => T + (1 - Math.min(v, ymax) / ymax) * (H - T - B);
  const shown = points.filter((p): p is [number, number] => p[1] !== null && p[1] <= ymax);
  const line = shown.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const yLabel = (v: number) => (mode === "dist" ? chanceTick(v) : mode === "cost" ? formatMeso(v) : v.toFixed(1));

  const move = (e: React.MouseEvent) => {
    const box = svg.current!.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    const score = ((vx - L) / (W - L - R)) * xmax;
    under.current = score;
    const i = pointAt(points, score, (6 / (W - L - R)) * xmax, mode === "dist");
    setHover(i < 0 ? null : i);
  };
  const h = hover === null ? null : points[hover];
  const tip =
    h && h[1] !== null
      ? mode === "dist"
        ? [`score ${formatScore(h[0])}: ${h[1] < 0.01 ? chanceTick(h[1]) : `${(h[1] * 100).toFixed(2)}%`}`, `at least this: ${formatChance(atLeastOf[hover!]!)}`]
        : mode === "gain"
          ? [`at score ${formatScore(h[0])}`, `+${h[1].toFixed(2)} score a ${per}`]
          : [`at score ${formatScore(h[0])}`, `${formatMeso(h[1])} per +1 score`]
      : null;
  const curX = X(current);
  const nearRight = curX > W - 130;

  return (
    <div className="flame-chart">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={CHART_MODES.find(([m]) => m === mode)![1]}>
        <defs>
          <clipPath id="flame-worse">
            <rect x={0} y={0} width={curX} height={H} />
          </clipPath>
          <clipPath id="flame-better">
            <rect x={curX} y={0} width={W} height={H} />
          </clipPath>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line className="grid-line" x1={L} x2={W - R} y1={Y(f * ymax)} y2={Y(f * ymax)} />
            <text className="axis" x={L - 6} y={Y(f * ymax) + 4} textAnchor="end">
              {yLabel(f * ymax)}
            </text>
            <text className="axis" x={X(f * xmax)} y={H - 10} textAnchor="middle">
              {Math.round(f * xmax).toLocaleString("en-US")}
            </text>
          </g>
        ))}
        {mode === "dist" && shown.length > 0 ? (
          <>
            <rect className="better-zone" x={curX} y={T} width={Math.max(0, W - R - curX)} height={H - T - B} />
            <path className="area worse" d={`${line}L${X(shown.at(-1)![0]).toFixed(1)},${Y(0)}L${X(shown[0]![0]).toFixed(1)},${Y(0)}Z`} clipPath="url(#flame-worse)" />
            <path className="area better" d={`${line}L${X(shown.at(-1)![0]).toFixed(1)},${Y(0)}L${X(shown[0]![0]).toFixed(1)},${Y(0)}Z`} clipPath="url(#flame-better)" />
            <path className="series worse" d={line} clipPath="url(#flame-worse)" />
            <path className="series better" d={line} clipPath="url(#flame-better)" />
          </>
        ) : (
          <path className="series better" d={line} />
        )}
        {mode === "dist" && target !== null && (
          <>
            <line className="target" x1={X(target)} x2={X(target)} y1={T} y2={H - B} />
            <text className="target-label" x={X(target) + 4} y={T + 26}>
              target {formatScore(target)}
            </text>
          </>
        )}
        <line className="current" x1={curX} x2={curX} y1={T} y2={H - B} />
        <text className="current-label" x={curX + (nearRight ? -5 : 5)} y={T + 12} textAnchor={nearRight ? "end" : "start"}>
          your score {formatScore(current)}
        </text>
        {h && h[1] !== null && (
          <>
            <line className="cross" x1={X(h[0])} x2={X(h[0])} y1={T} y2={H - B} />
            <circle className="dot" cx={X(h[0])} cy={Y(h[1])} r={4.5} />
          </>
        )}
        <rect
          x={L}
          y={T}
          width={W - L - R}
          height={H - T - B}
          fill="transparent"
          className={mode === "dist" && onPick ? "pickable" : undefined}
          onMouseMove={move}
          onMouseLeave={() => setHover(null)}
          onClick={() => {
            if (mode !== "dist" || !onPick) return;
            // the point picked, else the score under the pointer, to a tenth
            if (h) onPick(h[0]);
            else if (under.current !== null) onPick(Math.round(Math.max(0, under.current) * 10) / 10);
          }}
        />
      </svg>
      {tip && h && (
        <div className="chart-tip" style={{ left: `${(X(h[0]) / W) * 100}%`, top: `${(Y(h[1]!) / H) * 100}%` }}>
          <b>{tip[0]}</b>
          <br />
          {tip[1]}
        </div>
      )}
    </div>
  );
}

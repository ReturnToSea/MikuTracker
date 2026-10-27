import { useRef, useState } from "react";
import type { StarForceDetail } from "../api/types";
import { formatChance, formatMeso, pointAt } from "../lib/flames";
import { costPoints } from "../lib/starForce";

export type SfChartMode = "cost" | "booms" | "perStar";
export const SF_CHART_MODES: [SfChartMode, string][] = [
  ["cost", "Cost to reach it"],
  ["booms", "Booms on the way"],
  ["perStar", "Cost per star"],
];

// One item's graph for its target: what a run costs (every total from the simulated runs, with the
// median and 75/90/99% marks), how many booms it takes, or the average cost of each next star (on a
// scale where each line is ten times the one below). Hovering shows the nearest point's values.
const W = 720;
const H = 240;
const L = 82;
const R = 14;
const T = 12;
const B = 30;

export function StarForceChart({ detail, mode }: { detail: StarForceDetail; mode: SfChartMode }) {
  const svg = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const g = detail.graphs;
  if (mode === "perStar" && g.perStar.length < 2) {
    const one = g.perStar[0];
    return <p className="small muted chart-note">{one ? `Just one step (to ${one.to}★): ${formatMeso(one.avgCost)} on average. Pick a target further up to compare stars.` : "Nothing to show."}</p>;
  }
  // every run costing about the same (one sure tap, say): nothing to draw
  if (mode === "cost" && g.cost.marks.p99 <= g.cost.marks.median * 1.01) return <p className="small muted chart-note">Nearly every run costs the same here: about {formatMeso(g.cost.marks.median)}.</p>;
  const log = mode === "perStar";
  const bw = g.booms.width;
  const points: [number, number][] = mode === "cost" ? costPoints(g.cost) : mode === "booms" ? g.booms.counts.map((share, i) => [i * bw, share]) : g.perStar.map((p) => [p.to, Math.log10(p.avgCost)]);
  const bars = mode === "booms" && points.length <= 40;
  const xmin = mode === "cost" ? 0 : points[0]![0];
  const xmax = Math.max(points.at(-1)![0], xmin + 1);
  const ys = points.map((p) => p[1]);
  const ymin = log ? Math.floor(Math.min(...ys)) : 0;
  const ymax = log ? Math.max(Math.ceil(Math.max(...ys)), ymin + 1) : Math.max(...ys, 1e-9);
  const X = (v: number) => L + ((v - xmin) / (xmax - xmin)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
  const yTicks = log ? Array.from({ length: ymax - ymin + 1 }, (_, i) => ymin + i) : [0, 0.25, 0.5, 0.75, 1].map((f) => f * ymax);
  const yLabel = (v: number) => (log ? formatMeso(10 ** v) : `${(v * 100).toFixed(v * 100 < 10 ? 1 : 0)}%`);
  // a boom count, or a range of them ("1,200–1,299"); the last one "or more" when runs went past it
  const lastLabel = (v: number) => {
    const last = v === points.at(-1)![0];
    const n = v.toLocaleString("en-US");
    if (bw === 1) return mode === "booms" && g.booms.more && last ? `${n}+` : n;
    return g.booms.more && last ? `${n}+` : `${n}–${(v + bw - 1).toLocaleString("en-US")}`;
  };
  // fewer labels when they're long (ranges of boom counts)
  const every = Math.ceil(points.length / (bw > 1 && mode === "booms" ? 6 : 16));
  const xTicks = mode === "cost" ? [0, 0.25, 0.5, 0.75, 1].map((f) => f * xmax) : points.map((p) => p[0]).filter((_, i, all) => i % every === 0 || i === all.length - 1);
  const xLabel = (v: number) => (mode === "cost" ? formatMeso(v) : mode === "perStar" ? `${v}★` : bw > 1 ? v.toLocaleString("en-US") : lastLabel(v));
  const line = points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
  const barW = Math.max(3, Math.min(28, (W - L - R) / points.length - 3));
  const marks = mode === "cost" ? ([["median", g.cost.marks.median], ["75%", g.cost.marks.p75], ["90%", g.cost.marks.p90], ["99%", g.cost.marks.p99]] as const) : [];

  const move = (e: React.MouseEvent) => {
    const box = svg.current!.getBoundingClientRect();
    const v = xmin + (((((e.clientX - box.left) / box.width) * W - L) / (W - L - R)) * (xmax - xmin));
    const i = pointAt(points, v, 0, false);
    setHover(i < 0 ? null : i);
  };
  const h = hover === null ? null : points[hover]!;
  const tip = !h ? null : mode === "cost" ? [`about ${formatMeso(h[0])}`, `${formatChance(h[1])} of runs`] : mode === "booms" ? [`${lastLabel(h[0])} booms`, `${formatChance(h[1])} of runs`] : [`to ${h[0]}★`, `${formatMeso(10 ** h[1])} on average`];

  return (
    <div className="flame-chart">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={SF_CHART_MODES.find(([m]) => m === mode)![1]}>
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line className="grid-line" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
            <text className="axis" x={L - 6} y={Y(v) + 4} textAnchor="end">
              {yLabel(v)}
            </text>
          </g>
        ))}
        {xTicks.map((v, i) => (
          <text key={`x${v}`} className="axis" x={X(v)} y={H - 10} textAnchor={i === xTicks.length - 1 && xTicks.length > 1 ? "end" : "middle"}>
            {xLabel(v)}
          </text>
        ))}
        {bars ? (
          points.map(([x, y]) => <rect key={x} className="bar" x={X(x) - barW / 2} y={Y(y)} width={barW} height={Math.max(0, Y(0) - Y(y))} rx={2} />)
        ) : (
          <path className="series better" d={line} />
        )}
        {log && points.map(([x, y]) => <circle key={x} className="dot-series" cx={X(x)} cy={Y(y)} r={3.5} />)}
        {marks.map(([label, v], i) => {
          // near the right edge the label goes on the line's left
          const right = X(v) > W - 150;
          return (
            <g key={label}>
              <line className="current" x1={X(v)} x2={X(v)} y1={T} y2={H - B} />
              <text className="current-label" x={X(v) + (right ? -4 : 4)} y={T + 12 + i * 14} textAnchor={right ? "end" : "start"}>
                {label} {formatMeso(v)}
              </text>
            </g>
          );
        })}
        {h && (
          <>
            <line className="cross" x1={X(h[0])} x2={X(h[0])} y1={T} y2={H - B} />
            <circle className="dot" cx={X(h[0])} cy={Y(h[1])} r={4.5} />
          </>
        )}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={move} onMouseLeave={() => setHover(null)} />
      </svg>
      {tip && h && (
        <div className="chart-tip" style={{ left: `${(X(h[0]) / W) * 100}%`, top: `${(Y(h[1]) / H) * 100}%` }}>
          <b>{tip[0]}</b>
          <br />
          {tip[1]}
        </div>
      )}
    </div>
  );
}

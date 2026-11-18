// npx tsx scripts/curve-data.mjs --since <YYYY-MM-DD> <MapleScouter captures (.har) and saved answers (.jsonl)…>:
// rebuilds the score curves (server/src/gameFigures/score-curves.json), by hand, after scripts/stats-data.mjs.
// Nothing here goes to the network.
//   - Each MapleScouter answer gives points on its class's curve: its score and damage at 380% and 300% boss
//     defense, and its growth points (the damage at its score ± 5,000 / 10,000 / 20,000, to 0.1%: 380% only;
//     one with under 10% of the damage left is mostly rounding, left out). Its damage figures leave out the
//     skill-cooldown bonus its score counts, so each point gets ours (as the app gives it: calc/stats.ts's
//     cooldownBonus), and the class's scale. Only answers since --since count (MapleScouter's figures change
//     with its updates: a capture from before its current ones was ~3% off).
//   - A class measured in full (MEASURED: points from under 5,000 to over 170,000, no gap over 15,000) gets its
//     own curve: points at 500, every 1,000 to 10,000, then every 2,500 to 180,000 (and 24,704, MapleScouter's
//     own first point, where its curve turns), each read off the measured points (their damage per score point,
//     straight between them), with slopes that keep it rising (Fritsch–Carlson); its 300% curve is its 380%
//     curve × the two's measured ratio. Past its last point it goes on straight, as MapleScouter's does.
//   - Every other class keeps mapledoro's curve from 33,228 up, and below it the measured classes' shared shape
//     (what the damage per score point is, as a share of the class's average from 0 to 33,228), scaled by the
//     class's own point at 33,228, or fitted to its own points below 33,228 where it has enough.
// The saved answers (.jsonl, one per line): { core: { cls, s380, s300?, d380, d300?, tiers }, cdSec } or the
// walkthrough's { cls, s380, dmg, tiers, cdSec } (MapleScouter's class names, in Korean).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cooldownBonus } from "../server/src/calc/stats.ts";
import jobFigures from "../server/src/gameFigures/stats-jobs.json" with { type: "json" };

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/score-curves.json");
const MEASURED = ["Ren", "Lethe"];
const JOIN = 33228; // (mapledoro's second point, the same for every class: the shared shape is below it)
// (every 2,500 to 30,000, and MapleScouter's own first point, 24,704, where its curve turns)
const LOW = [...Array.from({ length: 12 }, (_, i) => 2500 * (i + 1)), 24704].sort((a, b) => a - b);
const OWN = [500, ...Array.from({ length: 10 }, (_, i) => 1000 * (i + 1)), ...Array.from({ length: 68 }, (_, i) => 12500 + 2500 * i), 24704].sort((a, b) => a - b); // (a measured class's points, past 0)
// MapleScouter's class names (its class list, 2026-11-18) → ours.
const JOB = {
  나이트로드: "Night Lord", 나이트워커: "Night Walker", 다크나이트: "Dark Knight", 데몬슬레이어: "Demon Slayer", 데몬어벤져: "Demon Avenger",
  듀얼블레이드: "Dual Blade", 라라: "Lara", 레테: "Lethe", 렌: "Ren", 루미너스: "Luminous", 메르세데스: "Mercedes", 메카닉: "Mechanic", 미하일: "Mihile",
  바이퍼: "Buccaneer", 배틀메이지: "Battle Mage", 보우마스터: "Bow Master", 블래스터: "Blaster", 비숍: "Bishop", 섀도어: "Shadower", 소울마스터: "Dawn Warrior",
  스트라이커: "Thunder Breaker", 신궁: "Marksman", 아델: "Adele", 아란: "Aran", 아크: "Ark", "아크메이지(불,독)": "Arch Mage Fire/Poison",
  "아크메이지(썬,콜)": "Arch Mage Ice/Lightning", 에반: "Evan", 엔젤릭버스터: "Angelic Buster", 와일드헌터: "Wild Hunter", 윈드브레이커: "Wind Archer",
  은월: "Shade", 일리움: "Illium", 제논: "Xenon", 제로: "Zero", 카데나: "Cadena", 카이저: "Kaiser", 카인: "Kain", 칼리: "Khali", 캐논슈터: "Cannoneer",
  캡틴: "Corsair", 키네시스: "Kinesis", 팔라딘: "Paladin", 패스파인더: "Pathfinder", 팬텀: "Phantom", 플레임위자드: "Blaze Wizard", 호영: "Hoyoung",
  히어로: "Hero", 하야토: "Hayato", 묵현: "Mo Xuan", 린: "Lynn", 칸나: "Kanna", 시아: "Sia Astelle", 에렐: "Erel Light",
};

const args = process.argv.slice(2);
const since = args.includes("--since") ? args[args.indexOf("--since") + 1] : undefined;
const files = args.filter((a, i) => a !== "--since" && args[i - 1] !== "--since");
if (files.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(since ?? "")) {
  console.log("Usage: npx tsx scripts/curve-data.mjs --since <YYYY-MM-DD> <capture.har | answers.jsonl> [more…]");
  console.log("  (--since: the first day of MapleScouter's current figures; older answers are left out)");
  process.exit(1);
}
const jobs = jobFigures.jobs;
const refs = jobFigures.cooldownRefs;
const problems = [];

// Every answer, as { job, cdSec, s380, d380, s300, d300, tiers }.
const answers = [];
const textOf = (c) => (c.encoding === "base64" ? Buffer.from(c.text, "base64").toString("utf8") : c.text);
for (const file of files) {
  if (file.endsWith(".jsonl")) {
    for (const line of readFileSync(file, "utf8").trim().split("\n")) {
      const a = JSON.parse(line);
      const c = a.core ?? { cls: a.cls, s380: a.s380, d380: a.dmg, tiers: a.tiers };
      answers.push({ job: JOB[c.cls], date: (c.savedAt ?? a.date)?.slice(0, 10), cdSec: a.cdSec, s380: c.s380, d380: c.d380, s300: c.s300, d300: c.d300, tiers: c.tiers });
    }
    continue;
  }
  for (const e of JSON.parse(readFileSync(file, "utf8")).log.entries) {
    if (e.request.method !== "POST" || !e.request.url.includes("/api/calc/dmg") || !e.response.content?.text) continue;
    const u = JSON.parse(e.request.postData.text).userStat;
    const d = JSON.parse(textOf(e.response.content)).calculatedData;
    if (u.special.challenge || d.bossCutsOpts?.isChallengers || !d.growthTiers) continue; // (Challenger mode: left out)
    answers.push({ job: JOB[d.class], date: e.startedDateTime.slice(0, 10), cdSec: Number(u.stat.coolTimeReduce), s380: d.boss380_hexaStat, d380: d.calculatedHexaDamage_380, s300: d.boss300_hexaStat, d300: d.calculatedHexaDamage_300, tiers: d.growthTiers.map((g) => [g.delta, g.pct]) });
  }
}
for (const a of answers) if (!a.job || !jobs[a.job] || !(a.cdSec >= 0) || !a.date) problems.push(`an answer for an unknown class, cooldown or day: ${JSON.stringify(a).slice(0, 120)}`);
// (MapleScouter's figures change with its updates: only answers since its current ones count)
const older = answers.filter((a) => a.date < since).length;
answers.splice(0, answers.length, ...answers.filter((a) => a.date >= since));

// What the curve takes for MapleScouter's damage at a score: × the class's scale and our cooldown bonus there.
// (the app reads the cooldown table at the score before the bonus: MapleScouter's score over the bonus, near enough)
const curveInput = (job, damage, cdSec, score) => {
  const s = Math.round(cdSec);
  if (s <= 0) return damage * jobs[job].splineScale;
  const before = score / (1 + cooldownBonus(jobs[job], refs, s, score));
  return damage * jobs[job].splineScale * (1 + cooldownBonus(jobs[job], refs, s, before));
};
// A class's points ([score, curve input]), sorted, with points closer than 30 apart averaged (in log damage).
function points(job, guard) {
  const raw = [];
  for (const a of answers.filter((a) => a.job === job)) {
    if (guard === 380) {
      raw.push([a.s380, curveInput(job, a.d380, a.cdSec, a.s380)]);
      // (a point with under 10% of the damage left is mostly rounding: 0.1% of 100%)
      for (const [delta, pct] of (a.tiers ?? []).filter(([, pct]) => 100 + pct >= 10)) raw.push([a.s380 + delta, curveInput(job, a.d380 * (1 + pct / 100), a.cdSec, a.s380 + delta)]);
    } else if (a.s300 && a.d300) raw.push([a.s300, curveInput(job, a.d300, a.cdSec, a.s300)]);
  }
  raw.sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const [s, d] of raw) {
    const last = out.at(-1);
    if (last && s - last.s < 30) last.logs.push([s, Math.log(d)]);
    else out.push({ s, logs: [[s, Math.log(d)]] });
  }
  return out.map((p) => [p.logs.reduce((a, [s]) => a + s, 0) / p.logs.length, Math.exp(p.logs.reduce((a, [, l]) => a + l, 0) / p.logs.length)]);
}
// The value at s read off sorted points: the damage per score point straight between them (held from 0 to the
// first: damage per point changes smoothly, damage itself near 0 doesn't).
function readOff(pts, s) {
  if (s <= pts[0][0]) return (pts[0][1] * s) / pts[0][0];
  for (let i = 1; i < pts.length; i++)
    if (s <= pts[i][0]) {
      const [[s0, d0], [s1, d1]] = [pts[i - 1], pts[i]];
      return s * (d0 / s0 + ((s - s0) / (s1 - s0)) * (d1 / s1 - d0 / s0));
    }
  return null;
}
// Slopes that keep a rising curve rising (Fritsch–Carlson); `keep`: slopes already known, by index.
function slopes(x, y, keep = {}) {
  const n = x.length;
  const d = x.slice(0, -1).map((_, k) => (y[k + 1] - y[k]) / (x[k + 1] - x[k]));
  const m = x.map((_, k) => (k === 0 ? d[0] : k === n - 1 ? d[n - 2] : d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2));
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) continue;
    const [a, b] = [m[k] / d[k], m[k + 1] / d[k]];
    if (a * a + b * b > 9) {
      const t = 3 / Math.hypot(a, b);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }
  for (const [k, v] of Object.entries(keep)) m[Number(k)] = v;
  return m;
}
const splineAt = ({ x, y, m }, t) => {
  const L = x.length;
  if (t > x[L - 1]) return y[L - 1] + (t - x[L - 1]) * m[L - 1];
  const i = Math.max(0, x.findIndex((v, k) => k < L - 1 && t <= x[k + 1]));
  const h = x[i + 1] - x[i], s = (t - x[i]) / h;
  return (2 * s ** 3 - 3 * s ** 2 + 1) * y[i] + (s ** 3 - 2 * s ** 2 + s) * h * m[i] + (-2 * s ** 3 + 3 * s ** 2) * y[i + 1] + (s ** 3 - s ** 2) * h * m[i + 1];
};
const round = (v) => Number(v.toPrecision(10));
const pack = (x, y, m) => ({ x, y: y.map(round), m: m.map(round) });
const med = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];

// The measured classes' own curves.
const curves = {};
const report = [];
for (const job of MEASURED) {
  const p380 = points(job, 380), p300 = points(job, 300);
  const gaps = p380.slice(1).map((p, i) => p[0] - p380[i][0]);
  if (!p380.length || p380[0][0] > 5000 || p380.at(-1)[0] < 170000 || Math.max(...gaps) > 15000) {
    problems.push(`${job}: not measured in full (points from ${Math.round(p380[0]?.[0])} to ${Math.round(p380.at(-1)?.[0])}, biggest gap ${Math.round(Math.max(...gaps))}; want under 5,000 to over 170,000, gaps under 15,000)`);
    continue;
  }
  if (p300.length < 4) problems.push(`${job}: only ${p300.length} points at 300%`);
  // (points up to the last measured one: past it the curve goes on straight)
  const x = [0, ...OWN.filter((v) => v <= p380.at(-1)[0])];
  const y380 = x.map((s) => (s === 0 ? 0 : readOff(p380, s)));
  const s380 = pack(x, y380, slopes(x, y380));
  // (the 300% curve: the 380% one × their ratio at each 300% point, straight between, held at the ends)
  const ratio = p300.map(([s, d]) => [s, d / splineAt(s380, s)]);
  const ratioAt = (s) => (s <= ratio[0][0] ? ratio[0][1] : s >= ratio.at(-1)[0] ? ratio.at(-1)[1] : (() => { const i = ratio.findIndex(([r]) => r >= s); const [[a, ra], [b, rb]] = [ratio[i - 1], ratio[i]]; return ra + ((s - a) / (b - a)) * (rb - ra); })());
  const y300 = x.map((s, i) => y380[i] * ratioAt(s));
  const s300 = pack(x, y300, slopes(x, y300));
  const off = (sp, pts) => pts.map(([s, d]) => Math.abs(splineAt(sp, s) / d - 1) * 100);
  const [o380, o300] = [off(s380, p380), off(s300, p300)];
  const worst = o380.indexOf(Math.max(...o380));
  report.push(`${job}: ${p380.length} points at 380% (${Math.round(p380[0][0])}–${Math.round(p380.at(-1)[0])}), ${p300.length} at 300%; the curve is off them by median ${med(o380).toFixed(3)}% / most ${Math.max(...o380).toFixed(2)}% (at ${Math.round(p380[worst][0])}; under 0.5% from ${Math.round(p380.filter((_, i) => o380[i] >= 0.5).reduce((a, p) => Math.max(a, p[0]), 0))} up) (380), ${med(o300).toFixed(3)}% / ${Math.max(...o300).toFixed(2)}% (300)`);
  if (process.env.CURVE_DEBUG) for (const [i, [s, d]] of p380.entries()) if (o380[i] >= 0.3) console.log(`  ${job} ${Math.round(s)}: ${((splineAt(s380, s) / d - 1) * 100).toFixed(2)}%`);
  curves[job] = { source: "measured", from: Math.round(p380[0][0]), to: Math.round(p380.at(-1)[0]), spline380: s380, spline300: s300 };
}

// The shared shape below 33,228: the measured classes' damage per point, as a share of their average to 33,228.
const shareAt = (sp, s) => (splineAt(sp, s) / s) / (splineAt(sp, JOIN) / JOIN);
const measured = Object.keys(curves);
const shape = LOW.map((s) => measured.reduce((a, j) => a + shareAt(curves[j].spline380, s), 0) / measured.length);
if (measured.length >= 2) {
  const spread = LOW.map((s, i) => Math.max(...measured.map((j) => Math.abs(shareAt(curves[j].spline380, s) / shape[i] - 1) * 100)));
  report.push(`The shared shape (${LOW[0]}–${LOW.at(-1)}): ${shape.map((v) => v.toFixed(3)).join(" ")}; the measured classes are within ${Math.max(...spread).toFixed(2)}% of it`);
}
// (the other classes' growth points below 33,228 against the shape: a check, not used)
const shapeCurve = (y2) => { const x = [0, ...LOW, JOIN]; const y = [0, ...LOW.map((s, i) => (shape[i] * s * y2) / JOIN), y2]; return pack(x, y, slopes(x, y)); };
const checks = [];
for (const a of answers.filter((a) => !MEASURED.includes(a.job) && a.s380 < JOIN)) {
  const sc = shapeCurve(1);
  for (const [delta, pct] of a.tiers ?? []) {
    if (delta > 0 || a.s380 + delta < 1000) continue;
    checks.push({ job: a.job, off: ((splineAt(sc, a.s380 + delta) / splineAt(sc, a.s380)) / (1 + pct / 100) - 1) * 100 });
  }
}
if (checks.length) report.push(`The other classes' growth points below 33,228 (${new Set(checks.map((c) => c.job)).size} classes, ${checks.length} points) against the shape: median ${med(checks.map((c) => Math.abs(c.off))).toFixed(2)}%, most ${Math.max(...checks.map((c) => Math.abs(c.off))).toFixed(2)}%`);

// Every other class: mapledoro's curve from 33,228 up, the shape below, scaled by mapledoro's point at 33,228;
// or, for a class with its own points below 33,228 (FIT_MIN of them, over FIT_SPAN), scaled to fit those
// (the point at 33,228 with it: the owner, 2026-11-18; mapledoro's is off by up to a few % for some classes).
const FIT_MIN = 3;
const FIT_SPAN = 10000;
for (const [job, f] of Object.entries(jobs)) {
  if (curves[job] || !f.spline380) continue;
  const lowered = (sp, scale) => {
    const k = sp.x.indexOf(JOIN);
    if (k < 0) problems.push(`${job}: no point at ${JOIN}`);
    const x = [0, ...LOW, ...sp.x.slice(k)];
    const y = [0, ...LOW.map((s, i) => (scale * shape[i] * s * sp.y[k]) / JOIN), scale * sp.y[k], ...sp.y.slice(k + 1)];
    // (mapledoro's slopes past 33,228 are kept; at 33,228 too unless the point moved)
    const keep = Object.fromEntries(sp.m.slice(k).map((v, i) => [LOW.length + 1 + i, v]).filter(([i]) => scale === 1 || i > LOW.length + 1));
    return pack(x, y, slopes(x, y, keep));
  };
  const own = points(job, 380).filter(([s]) => s >= 1000 && s <= JOIN);
  if (own.length >= FIT_MIN && own.at(-1)[0] - own[0][0] >= FIT_SPAN) {
    const plain = lowered(f.spline380, 1);
    const scale = Math.exp(own.reduce((a, [s, d]) => a + Math.log(d / splineAt(plain, s)), 0) / own.length);
    const fitted = lowered(f.spline380, scale);
    const offs = own.map(([s, d]) => Math.abs(splineAt(fitted, s) / d - 1) * 100);
    report.push(`${job}: low end fitted to ${own.length} of its points (${Math.round(own[0][0])}–${Math.round(own.at(-1)[0])}): ×${scale.toFixed(4)} on mapledoro's; off them by median ${med(offs).toFixed(2)}% / most ${Math.max(...offs).toFixed(2)}%`);
    curves[job] = { source: "fitted", points: own.length, spline380: fitted, spline300: lowered(f.spline300, scale) };
  } else curves[job] = { source: "mapledoro", spline380: lowered(f.spline380, 1), spline300: lowered(f.spline300, 1) };
}
for (const [job, c] of Object.entries(curves))
  for (const sp of [c.spline380, c.spline300])
    if (sp.y.some((v, i) => i > 0 && !(v > sp.y[i - 1])) || sp.m.some((v) => !(v >= 0))) problems.push(`${job}: a curve that doesn't keep rising`);

console.log(`${answers.length} answers since ${since} (${older} older left out).\n${report.join("\n")}`);
if (problems.length) {
  console.log(`Not written:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const generated = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, `${JSON.stringify({ generated, sources: { measured: `MapleScouter's answers since ${since} (the owner's captures and Claude's sessions in the owner's browser): ${answers.length} answers`, rest: "mapledoro's curves (stats-jobs.json) from 33,228 up; below, the measured classes' shared shape, fitted to the class's own answers where it has enough" }, join: JOIN, shape: { x: LOW, share: shape.map(round) }, classes: curves })}\n`);
console.log(`${Object.keys(curves).length} classes' curves written to ${OUT} (${measured.join(", ")} measured; ${Object.values(curves).filter((c) => c.source === "fitted").length} fitted below ${JOIN}).`);

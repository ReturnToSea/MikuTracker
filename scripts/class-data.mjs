// npx tsx scripts/class-data.mjs --since <YYYY-MM-DD> --classes "Ren,Lethe,Night Walker" [--hold-out 29,30,31] [--leave-out <capture time or n>,…] <captures (.har) and saved answers (.jsonl)…>:
// rebuilds the classes' own figures measured from MapleScouter's answers (server/src/gameFigures/measured-classes.json),
// by hand (v4.6.0), after scripts/stats-data.mjs. Nothing here goes to the network.
//   - An answer counts when it has its sheet (the userStat MapleScouter's page sent) and its efficiencies, since --since
//     (MapleScouter's figures change with its updates), and isn't a Challenger World sheet. Saved answers (.jsonl): one
//     { n?, at, userStat, calculatedData } per line; --hold-out leaves those n out of the fit (they're only checked).
//   - Each answer's efficiencies give MapleScouter's damage % total (1 / dmgeff1 − 100) and ATT % total (1 / atkPereff1).
//     Ours, from mapledoro's figures and our shared rules with the class's own damage % and Angelic Buster's link at 0,
//     leaves the rest: the class's own damage % + the link's share by level × (its amount at buff duration 0 + its
//     amount per point of buff duration). Those three are fitted together (least squares), so a class needs answers
//     with the link off and with buff duration changed; its ATT % is mapledoro's + the answers' middle gap; its scale
//     is mapledoro's × the geometric mean of MapleScouter's damage over ours, with everything else fitted.
//   - The shared part: the defense MapleScouter keeps at 380% (from its efficiency there) over ours, on every answer (every
//     class's defense figure × it, first); and for the classes not measured, the measured classes' average link amount at
//     buff duration 0, and their average of (per buff duration) / (mapledoro's per-buff-duration figure).
//   - It prints, for every answer (the held-out ones too), our damage against MapleScouter's at 380% and 300%.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { groups, statsScore } from "../server/src/calc/stats.ts";
import { ANGEL_LINK_SHARE, cooldownRefs, ILLIUM_LINK, mapledoroJob, statLinks } from "../server/src/gameFigures/stats.ts";
import { fromSheet } from "./scouter-sheet.ts";

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/measured-classes.json");
const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const since = opt("--since");
const classes = (opt("--classes") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
const holdOut = new Set((opt("--hold-out") ?? "").split(",").filter(Boolean).map(Number));
// (--leave-out: answers left out of the fit and the check, by their capture time or saved n, e.g. a sheet where MapleScouter's
// own figures disagree with each other; they're still printed)
const leaveOut = new Set((opt("--leave-out") ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const files = args.filter((a, i) => !a.startsWith("--") && !["--since", "--classes", "--hold-out", "--leave-out"].includes(args[i - 1]));
if (files.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(since ?? "") || classes.length === 0) {
  console.log('Usage: npx tsx scripts/class-data.mjs --since <YYYY-MM-DD> --classes "<class>,<class>" [--hold-out <n>,<n>] [--leave-out <capture time or n>,…] <capture.har | answers.jsonl> [more…]');
  process.exit(1);
}
for (const c of classes) if (!mapledoroJob(c)) throw new Error(`--classes: no figures for ${c}`);

// Every answer: { job, input, ctx, d (calculatedData), label, held }
const answers = [];
const seen = new Set();
const textOf = (c) => (c.encoding === "base64" ? Buffer.from(c.text, "base64").toString("utf8") : c.text);
function add(userStat, d, at, label, held, id) {
  if (at < since || userStat?.special?.challenge || !d?.specEfficiency?.dmgeff1) return;
  // (the same sheet answered twice counts once)
  const key = JSON.stringify(userStat) + d.calculatedHexaDamage_380;
  if (seen.has(key)) return;
  seen.add(key);
  const sheet = fromSheet(userStat);
  if (classes.includes(sheet.job)) answers.push({ ...sheet, d, label, held, left: leaveOut.has(id) });
}
for (const file of files) {
  if (file.endsWith(".jsonl")) {
    for (const line of readFileSync(file, "utf8").trim().split("\n").filter(Boolean)) {
      const a = JSON.parse(line);
      add(a.userStat, a.calculatedData, a.at ?? "", `${path.basename(file)} #${a.n}`, holdOut.has(a.n), String(a.n));
    }
  } else {
    for (const e of JSON.parse(readFileSync(file, "utf8")).log.entries) {
      if (e.request.method !== "POST" || !e.request.url.includes("/api/calc/dmg") || !e.response.content.text) continue;
      add(JSON.parse(e.request.postData.text).userStat, JSON.parse(textOf(e.response.content)).calculatedData, e.startedDateTime, `${path.basename(file)} ${e.startedDateTime}`, false, e.startedDateTime);
    }
  }
}

// Least squares for a few unknowns (normal equations, by elimination).
function solve(rows, ys) {
  const k = rows[0].length;
  const A = Array.from({ length: k }, (_, i) => [...Array.from({ length: k }, (_, j) => rows.reduce((t, r) => t + r[i] * r[j], 0)), rows.reduce((t, r, q) => t + r[i] * ys[q], 0)]);
  for (let i = 0; i < k; i++) {
    const p = A.slice(i).reduce((b, r, q) => (Math.abs(r[i]) > Math.abs(A[b][i]) ? q + i : b), i);
    [A[i], A[p]] = [A[p], A[i]];
    if (Math.abs(A[i][i]) < 1e-9) throw new Error("not enough different answers to tell the class's figures apart");
    for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c]; }
  }
  return A.map((r, i) => r[k] / r[i]);
}

const links = statLinks(), refs = cooldownRefs();
// Illium's link by class (it stacks as you move, so MapleScouter counts it per class), measured by hand, a probe at each
// level (2026-11-19): Ren 2 → 0 −10, → 1 −3, → 3 +3; Lethe 2 → 1 −3; Night Walker 2 → 0 −5, → 1 −1.5. A class not here
// keeps mapledoro's (the owner).
const ILLIUM = { Ren: ILLIUM_LINK, Lethe: ILLIUM_LINK, "Night Walker": { 0: 0, 1: 3.5, 2: 5, 3: 6.5 } };
// The shared part of the defense: MapleScouter's defense kept at 380% (from its efficiency there) over ours, the same
// for every measured class (2026-11-19: ~1.002), so a shared change; every class's defense figure × it.
const kept = (a) => a.d.specEfficiency.igreff1_380 / (0.01 + a.d.specEfficiency.igreff1_380);
const fitAll = answers.filter((a) => !a.held && !a.left);
const defenseKeep = fitAll.reduce((t, a) => t + kept(a) / groups(mapledoroJob(a.job), a.input, a.ctx, links).keep, 0) / fitAll.length;
const out = {};
const report = [];
for (const name of classes) {
  const all = answers.filter((a) => a.job === name);
  const fit = all.filter((a) => !a.held && !a.left);
  const base = { ...mapledoroJob(name), defenseK: mapledoroJob(name).defenseK * defenseKeep, ...(ILLIUM[name] && { illium: ILLIUM[name] }) };
  // (the class's own damage % and the link at 0: what's left is theirs)
  const bare = { ...base, dmg: 1, angel: { base: 0, perBuffDuration: 0 } };
  const rows = fit.map((a) => { const sh = ANGEL_LINK_SHARE[a.input.links.angel]; return [1, sh, sh * a.input.stats.buffDuration]; });
  const ys = fit.map((a) => 1 / a.d.specEfficiency.dmgeff1 - 100 - (groups(bare, a.input, a.ctx, links).g.dmg - 1) * 100);
  if (!rows.some((r) => r[1] === 0) || new Set(fit.map((a) => a.input.stats.buffDuration)).size < 2)
    throw new Error(`${name}: needs answers with Angelic Buster's link off and with buff duration changed`);
  const [own, angelBase, perBuffDuration] = solve(rows, ys);
  // (ATT %: the middle of its answers' gaps, so one odd sheet doesn't move it: Lethe's with every HEXA core at 0 but Origin)
  const gaps = fit.map((a) => 1 / a.d.specEfficiency.atkPereff1 - groups(base, a.input, a.ctx, links).g.atkPct * 100).sort((x, y) => x - y);
  const atkGap = gaps.length % 2 ? gaps[(gaps.length - 1) / 2] : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2;
  const withAtk = { ...base, dmg: 1 + own / 100, angel: { base: angelBase, perBuffDuration }, atkPct: base.atkPct + atkGap / 100 };
  // (the Ring of Restraint's level 5, mapledoro's borrowed from another class for some: the rest of the ATT % gap on the
  // answers with it at 5 or 6, level 6 being level 5 × 85 / 68; Lethe's measured 2026-11-19: 4 → 5 gives +2.67, not +3.48)
  const r5 = fit.filter((a) => a.input.rings.restraint >= 5);
  const lv5Gap = r5.length ? r5.reduce((t, a) => t + (1 / a.d.specEfficiency.atkPereff1 - groups(withAtk, a.input, a.ctx, links).g.atkPct * 100) / (a.input.rings.restraint >= 6 ? 85 / 68 : 1), 0) / r5.length : 0;
  const job = { ...withAtk, restraint: { ...base.restraint, lv5: base.restraint.lv5 + lv5Gap / 100 } };
  const logRatio = fit.reduce((t, a) => t + Math.log(a.d.calculatedHexaDamage_380 / statsScore(job, a.input, a.ctx, links, refs).damage), 0) / fit.length;
  const fitted = { ...job, scale: base.scale * Math.exp(logRatio) };
  out[name] = {
    dmg: fitted.dmg, atkPct: fitted.atkPct, restraint: fitted.restraint, scale: fitted.scale, angel: fitted.angel, ...(ILLIUM[name] && { illium: ILLIUM[name] }),
    how: `fitted to ${fit.length} MapleScouter answers since ${since} (${all.filter((a) => a.held).length} held out to check, ${all.filter((a) => a.left).length} left out): its own damage %, Angelic Buster's link (off, and at other buff durations), ATT % (the answers' middle gap), the Ring of Restraint's level 5 (${r5.length} answers with it)${ILLIUM[name] ? ", its own Illium link (measured by hand)" : ""}, then the scale`,
    // (null: mapledoro has no per-buff-duration figure for the class, so it says nothing of the share)
    perBuffDurationShare: base.dmgPerBuffDuration > 0 ? perBuffDuration / (base.dmgPerBuffDuration * 100) : null,
  };
  for (const a of all) {
    const ours = statsScore(fitted, a.input, a.ctx, links, refs);
    report.push([name, a.left ? "left out" : a.held ? "held out" : "fitted", ours.damage / a.d.calculatedHexaDamage_380 - 1, ours.damage300 / a.d.calculatedHexaDamage_300 - 1, a.label]);
  }
}
const measured = Object.values(out);
const result = {
  generated: new Date().toISOString().slice(0, 10),
  sources: [`MapleScouter's answers since ${since} (${files.map((f) => path.basename(f)).join(", ")})`],
  shared: {
    defenseKeep,
    angelBase: measured.reduce((t, c) => t + c.angel.base, 0) / measured.length,
    angelPerBuffDurationShare: ((xs) => xs.reduce((t, x) => t + x, 0) / xs.length)(measured.map((c) => c.perBuffDurationShare).filter((x) => x !== null)),
  },
  classes: Object.fromEntries(Object.entries(out).map(([n, { perBuffDurationShare: _, ...c }]) => [n, c])),
};
writeFileSync(OUT, JSON.stringify(result, null, 1) + "\n");
for (const [n, c] of Object.entries(out))
  console.log(`${n}: own damage % ${((c.dmg - 1) * 100).toFixed(3)} (mapledoro ${((mapledoroJob(n).dmg - 1) * 100).toFixed(3)}), Angelic Buster L2 ${c.angel.base.toFixed(3)} + ${c.angel.perBuffDuration.toFixed(5)}/bd (${c.perBuffDurationShare?.toFixed(3) ?? "—"} of mapledoro's), ATT % ${c.atkPct.toFixed(5)} (mapledoro ${mapledoroJob(n).atkPct.toFixed(5)}), Restraint lv5 ${c.restraint.lv5.toFixed(4)} (mapledoro ${mapledoroJob(n).restraint.lv5.toFixed(4)}), scale ×${(c.scale / mapledoroJob(n).scale).toFixed(5)}`);
console.log(`shared: link at bd 0 ${result.shared.angelBase.toFixed(3)}, per-bd share ${result.shared.angelPerBuffDurationShare.toFixed(4)}, defense kept ×${defenseKeep.toFixed(5)}`);
const worst = (rows) => Math.max(...rows.map((r) => Math.max(Math.abs(r[2]), Math.abs(r[3]))));
for (const name of classes) {
  const rows = report.filter((r) => r[0] === name && r[1] !== "left out");
  const held = rows.filter((r) => r[1] === "held out");
  console.log(`${name}: ${rows.length} answers, worst ${(worst(rows) * 100).toFixed(3)}% (held out: ${held.length ? `${(worst(held) * 100).toFixed(3)}%` : "none"})`);
}
if (process.env.CLASS_DEBUG) for (const r of report) console.log(r[0].padEnd(13), r[1].padEnd(9), (r[2] * 100).toFixed(3).padStart(7) + "%", (r[3] * 100).toFixed(3).padStart(7) + "%", r[4]);
console.log(`Wrote ${OUT}`);

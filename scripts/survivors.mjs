// Lists mutants that no test caught, from Stryker's JSON report.
// Usage: node scripts/survivors.mjs [reports/mutation/mutation.json]
import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(process.argv[2] ?? "reports/mutation/mutation.json", "utf8"));
let total = 0;
for (const [file, { source, mutants }] of Object.entries(report.files)) {
  const lines = source.split("\n");
  const survivors = mutants.filter((m) => m.status === "Survived" || m.status === "NoCoverage");
  if (!survivors.length) continue;
  console.log(`\n== ${file} (${survivors.length})`);
  for (const m of survivors) {
    const { start, end } = m.location;
    const line = lines[start.line - 1];
    const original = start.line === end.line ? line.slice(start.column - 1, end.column - 1) : line.slice(start.column - 1) + " …";
    console.log(`  L${start.line} [${m.mutatorName}${m.status === "NoCoverage" ? ", no test runs it" : ""}] ${original.trim().slice(0, 90)}  →  ${String(m.replacement).replace(/\s+/g, " ").slice(0, 90)}`);
    total++;
  }
}
console.log(`\n${total} not caught`);

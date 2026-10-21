// Mutation testing: Stryker makes hundreds of small deliberate bugs (flipped comparisons,
// removed lines, changed constants) one at a time and checks that some test fails for each.
// A "survived" mutant is a behavior no test really checks. Run with: npm run test:mutate
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  // related: false — Vitest's "related tests" lookup can't follow the @miku/shared alias, so it
  // would skip every test for shared/ (reported as "no coverage"). Per-test coverage still
  // narrows which tests run for each mutant.
  vitest: { configFile: "server/vitest.config.ts", dir: "server", related: false },
  mutate: ["server/src/**/*.ts", "shared/src/**/*.ts", "!server/src/generated/**", "!server/src/**/*.test.ts", "!server/src/index.ts"],
  coverageAnalysis: "perTest",
  // On GitHub (STRYKER_BREAK_ON_SURVIVORS=1) any mutant no test catches fails the run.
  thresholds: { high: 100, low: 99, break: process.env.STRYKER_BREAK_ON_SURVIVORS ? 100 : null },
  concurrency: 2, // 4 workers crashed the SQLite driver in Goal Tracker; 2 also suits this Mac's 8 GB
  // Incremental: reuse earlier results for code and tests that haven't changed. Before each
  // version, run everything again with --force (npm run test:mutate:full): a change elsewhere
  // (a shared helper, sample data, a library) can make an old result stale.
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  timeoutMS: 20000,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
};

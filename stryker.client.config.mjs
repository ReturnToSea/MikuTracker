// Mutation testing for the React app (client/). Same idea as stryker.config.mjs for the
// server; run with: npm run test:mutate:client
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner", "./scripts/stryker-ignore-looks.mjs"],
  ignorers: ["looks"],
  vitest: { configFile: "client/vite.config.ts", dir: "client", related: false },
  // main.tsx only starts the app; api/types.ts has no code (types only); looks/ only draws
  // pictures on a canvas, which a browser test can't see (checked by eye on screenshots).
  mutate: ["client/src/**/*.{ts,tsx}", "!client/src/main.tsx", "!client/src/api/types.ts", "!client/src/looks/**"],
  coverageAnalysis: "perTest",
  // On GitHub (STRYKER_BREAK_ON_SURVIVORS=1) any mutant no test catches fails the run.
  thresholds: { high: 100, low: 99, break: process.env.STRYKER_BREAK_ON_SURVIVORS ? 100 : null },
  concurrency: 2, // this Mac has 8 GB
  // Incremental, like the server config: npm run test:mutate:full runs everything with --force.
  incremental: true,
  incrementalFile: "reports/stryker-incremental-client.json",
  timeoutMS: 20000,
  reporters: ["clear-text", "progress-append-only", "html", "json"],
  htmlReporter: { fileName: "reports/mutation-client/index.html" },
  jsonReporter: { fileName: "reports/mutation-client/mutation.json" },
  tempDirName: ".stryker-tmp-client", // its own folder, so it can run alongside the server run
};

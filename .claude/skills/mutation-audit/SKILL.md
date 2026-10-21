---
name: mutation-audit
description: Run Stryker mutation testing on part of this repo (a file, folder, or glob), then go through every surviving mutant with the owner — write a test that catches it, fix a real bug it exposes, or (only if provably behavior-neutral) annotate it with a reasoned Stryker disable comment — and rerun until nothing survives. Use when asked to audit tests, check test quality, or run mutation testing.
---

# Mutation audit

Target: `$ARGUMENTS` (a glob relative to the repo root, e.g. `server/src/calc/*.ts`). If none is given, ask which part of the code to audit.

**Where and how to run:** on this Mac, with `nice -n 19`. The server and app runs may go at the same time, but nothing else heavy alongside (no test suite, no build) — the Mac has 8 GB of memory and froze once when a test suite ran on top of two mutation runs. Runs are **incremental** (results in `reports/stryker-incremental*.json`); before a version is committed, run everything with `--force` (`npm run test:mutate:full`).

1. **Run Stryker** from the repo root, one area at a time:
   `npx stryker run --mutate "<glob>" --concurrency 2 --reporters progress,clear-text,json --logLevel warn`
   (The `progress` reporter shows "X of Y" and a time estimate — include it; long runs are otherwise silent until the end. Route and shared files are slow: they are only caught by API tests.)
   (Exclude `*.test.ts` files from the glob, e.g. `server/src/calc/!(*.test).ts`. Use concurrency 2: 4 workers crashed the SQLite driver in Goal Tracker, and this Mac has 8 GB.)
2. **List survivors:** `node scripts/survivors.mjs`
3. **Triage every survivor**, one by one:
   - **Test gap** → write a test that fails with the mutant. Prefer independent checks (hand-computed values, simulations, facts that must hold) over re-running the same code.
   - **Real bug** (the mutant reveals wrong behavior, or a test only passes by accident) → tell the owner, fix it, and test it.
   - **Provably no behavior change** → prefer simplifying the code so the mutant disappears; otherwise add `// Stryker disable next-line <Mutator>: <reason>` on its own line directly above the statement (move expressions out of chained calls first).
   - Before accepting a surprising result, **reproduce the mutant by hand** (edit, run the relevant test file, restore) — and make sure you're looking at the right line.
4. **Check new tests fail on the old code**, then run `npm test` and `npm run typecheck`.
5. **Rerun Stryker** on the same area until it reports 0 survived / 0 no coverage.
**If a whole file shows "no test runs it"** even though tests exercise it, suspect the setup before the tests:
- `stryker.config.mjs` must keep `vitest.related: false` — Vitest's related-tests lookup can't follow the `@miku/shared` alias.
- `server/vitest.config.ts` finds the server folder from the **working folder** (`serverFolder()`). Inside Stryker's sandbox both `import.meta.dirname` and `import.meta.url` still point at the original repo, so anything located through them (the shared-rules alias, the root) is loaded unmutated.
- To reproduce the sandbox by hand: copy the repo without `node_modules`, symlink `node_modules` to the original, and run `node node_modules/vitest/vitest.mjs run --config <copy>/server/vitest.config.ts` — **not `npx`**, which jumps back to the original repo.

**The React app** (`client/`) gets its own Stryker config (`stryker.client.config.mjs`) when the app is added (v0.2.0 step 6); this section will describe it then.

**A mutant that throws while a file loads is reported as Survived** (the Vitest runner sees "no failed tests" when a test file can't even import). If a survivor would obviously crash, reproduce it by hand before writing a test — and prefer moving that code out of the file's top level (e.g. read settings on first use, as `getConfig()` in `server/src/config.ts` does) so the crash happens inside a test.

6. **Report** in plain language: score before → after, bugs found, tests added, and each disabled mutant with its reason. Ask before committing (see versioning in `CLAUDE.md`).

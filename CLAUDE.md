# MikuTracker

Personal website for tracking MapleStory (GMS) characters on Kronos and Hyperion: level, EXP per UTC day, time to level, and the GMS EXP table. Character data comes from Nexon's public rankings data, never from the game client. It runs locally on one Mac, built so it can move to a server or Docker later by changing settings.

- **`DESIGN.md`**: how the app works **now**, part by part, with the decisions behind it. Read the relevant part before changing behavior; update it in place when behavior or a decision changes (it must never describe old behavior).
- **`PLAN.md`**: what's planned next, by version and step, with decisions, risks and research. When something is built, move its description into DESIGN.md and remove it from the plan.
- **`CHANGELOG.md`**: what each version changed.
- **`docs/theme-examples/index.html`**: the approved mockup (open it in a browser).

## Layout

- `server/`: Express 5 + Prisma 7 (SQLite) API.
  - `src/config.ts`: **every** setting.
  - `src/owner.ts` and `src/middleware/auth.ts`: whose data a request is about.
  - `src/calc/` (from v0.3.0): pure calculations, with no database and no HTTP.
  - `src/services/`: connect the database to them.
  - `src/routes/`: the API.
- `shared/` (`@miku/shared`): zod input rules used by the server and the app.
- `client/`: React 19 + Vite + Tailwind 4 app.
  - `src/api/`: the only place it talks to the server. Response types are imported from the server's code, type-only.
  - `src/lib/`: display logic as plain tested functions.
  - `src/looks/`: canvas drawing only, checked by eye.
  - `src/components/` and `src/pages/`: mostly layout.
- `scripts/`: the Stryker helpers, `nexon-watch.mjs` (research only, never part of the app), and `gear-data.mjs` / `gear-icons.mjs` (rebuild the gear list and download its icons, by hand, after a GMS patch).
- The data lives outside the repo, in `~/Library/Application Support/MikuTracker/`:
  - `miku.db`: real data; only the always-on app uses it.
  - `dev.db`: development (`npm run dev`, `npm run db:migrate`).
  - `backups/` and `avatars/`: the real data's. The dev copy has its own `dev-backups/` and `dev-avatars/`, so its clean-ups never touch the real files.
  - `theme-art/`: theme pictures (shared).
  - `boss-art/`: the bosses' banners from the game (`<boss id>.png`, shared; Nexon's art, so never in git).
  - `item-icons/`: the gear tab's item icons (`<item id>.png`, shared, never in git), downloaded by hand with `node scripts/gear-icons.mjs`.
  - `app/`: the always-on app's own copy of `main`.
- `tempdata/` is never committed. It holds the research log and the original theme art.

## Commands

- `npm test`: every server test, then every app test, each in California time and then UTC.
- `npm run typecheck`
- `npm run test:coverage`: for curiosity only; 100% mutation testing already implies it, so it's not part of the checklist.
- `npm run test:mutate` / `test:mutate:client`: Stryker mutation testing of server + shared / the app's logic. Both are **incremental** (only changed code and tests are retested). `npm run test:mutate:full` retests everything (see Testing rules for when).
- `npm run qa:check`: the click-through: every button and edge case of the production build, in a real browser, on an empty QA copy with the fake Nexon. About 3 minutes; screenshots go to the folder it prints.
- **Running them on this Mac (8 GB of memory):** the server and app runs may go at the same time, both with `nice -n 19` and `--concurrency 2`, but **nothing else heavy alongside**: no test suite, no build. One test suite at a time otherwise.
- Pushing a version branch runs `.github/workflows/tests.yml` on GitHub: the typecheck, every test, and the production build. Mutation testing and `qa:check` run only on the Mac.
- `npm run db:migrate -- --name <what>`: after changing `server/prisma/schema.prisma`, applied to `dev.db`, then regenerates the database code (Prisma 7's `migrate dev` no longer does that itself). If Prisma wants to ask a yes/no question (it can't here), write the migration with `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_<name>/migration.sql`, then `MIKU_DATABASE=dev prisma migrate deploy` and `prisma generate`. A test fails if a schema change has no migration.
- `npm run qa` (`-- --empty`, `-- --fake-nexon`): the throwaway QA copy for testing by hand or in a browser (see Testing rules).
- `npm run dev`: the development copy. The page is on http://127.0.0.1:4752 and its API on 4751, using `dev.db`, with no backups and no refresh.
- `npm run app:install` (once), `app:restart` (after each finished version: copy `main` and build it, **rehearse it on a copy of the real data**, then stop, back up, migrate the real database, swap, start), `app:rehearse` (only the rehearsal), `app:status`, `app:uninstall` (data and backups stay): the always-on app on http://127.0.0.1:4750, started by macOS at login. Its log is `~/Library/Logs/MikuTracker/app.log`.
- `npm run backup`: back up the real database now (`MIKU_DATABASE=dev` for the dev copy's). The always-on app backs up daily by itself.
- `npm run refresh`: one refresh of every character now (`MIKU_DATABASE=dev npm run refresh` for the dev copy). The always-on app refreshes every 4 hours by itself.
- `npm run nexon:check -- <name> [45|70]`: looks one character up in Nexon's **real** rankings, by hand (never in tests), to check their data still has the shape we expect.

## Conventions

- **Game time is UTC.** Daily resets and "EXP per day" use UTC days, computed explicitly in UTC, and are shown in local time.
- **Big numbers (EXP, raid power) are `BigInt` in the database** and plain numbers in JSON, which are exact up to 9,007,199,254,740,991. The most EXP a character can have, 8,509,498,537,428,819, fits.
- **Game figures** (worlds, the EXP table, boss crystal prices, symbols, the gear list) live in `server/src/gameFigures/` with their source and patch/date. Re-check the EXP table and boss prices after each GMS patch, and rebuild the gear list (`node scripts/gear-data.mjs`).
- **The server binds `127.0.0.1`** and refuses other addresses until login exists. The only exception is Docker: `HOST=0.0.0.0` with `MIKU_IN_CONTAINER=1`, port published to `127.0.0.1`.
- **Front end:** no hard-coded colors; only theme CSS variables (`client/src/styles/themes.css`). Ren is the default.
- **Theme art, boss art and item icons never go in git.** They live in the data folder's `theme-art/`, `boss-art/` and `item-icons/`.
- **The user's data never leaves the Mac.** The only outside requests are to Nexon (rankings and avatars, from v0.4.0) and Google Fonts.
- **Never read the game client, read its memory, or automate the game.** Those can get an account banned.

## How we work

- **Discuss before building.** The owner likes to understand each part first: explain the plan, the code and the imports in plain language, and ask when a behavior is a product decision rather than guessing.
- **Versioning:** `MAJOR.MINOR.PATCH` by importance (the owner's scheme, not strict semver): the first number for major changes, the second for features, the third for small fixes. The planned versions are listed in `PLAN.md`. **Before committing, say what the next version should be and get agreement.** Every version gets:
  - a `CHANGELOG.md` entry
  - the same `version` in all four `package.json` files (root, server, shared, client)
  - an annotated git tag (`vX.Y.Z`)
- **Branches:** one branch per version; fast-forward `main` when the version is done.
  - Claude may push **version branches** to run the GitHub checks. Name the branch explicitly, `git push origin refs/heads/vX.Y.Z`, because a tag shares the name.
  - **Never push `main` or tags.** The owner pushes those.
- **Explain in plain language**, and report honestly: if something failed, was skipped, or a test was wrong, say so.

## Testing rules

- **Every behavior gets a test.** Prefer checks that don't reuse the code under test: hand-computed values, step-by-step simulations, or facts that must always hold.
- **A new test must fail on the old code.** Temporarily break the code (or revert the fix) and confirm the test catches it before trusting it.
- **Deliberate bugs by hand only where mutation testing doesn't reach:** the page, the scripts (QA copy, always-on app), and behavior across several parts. In mutation-tested code, mutation testing already plants them systematically.
- **Page tests check what's shown and what happens, not exact wording** (decided 2026-10-23), except where the words carry the meaning (error messages, warnings, numbers). Exact sentences and class names in tests mostly break on harmless wording changes. Older tests stay as they are until they're touched.
- **Tests never touch the real data.** `server/vitest.config.ts` gives every run:
  - a throwaway database and data folder
  - **a fake home folder (`HOME`)**, so even code broken by mutation testing can only find a fake "real" data folder

  `config.ts` throws if a test run's database **or any folder** is inside the real data folder, checked against both homes. **Tests that create or delete files use paths from the test setup (`process.env.MIKU_DATA_DIR`), never from `getConfig()`**: in v0.5.0 a mutated config sent a test's clean-up to the real `theme-art/` folder. The root `vitest.config.ts` runs each part through its own config and skips `.stryker-tmp*/`.
- **No test reaches the network.** The Nexon client takes `fetch`, the clock and the pause as arguments. Tests use a fake Nexon (`server/test/fixtures/nexon.ts`) with made-up characters, answering the way the real one was seen to. Any real `fetch` in a server test throws (`server/test/setup.ts`).
- **Test setup requests** go through `ok(...)` in `server/test/api.ts`, so a failed setup fails loudly. `api()` gives each request a fresh app bound to `127.0.0.1`. Tables are cleared automatically between tests (`server/test/helpers.ts`).
- **Fake time:** tests fake only `Date` (`vi.useFakeTimers({ toFake: ["Date"] })`), starting at Tue 20 Oct 2026, 19:00 UTC. Time-dependent tests run in both time zones.
- **App tests** (`client/test/`) run against a fake server (`test/server.tsx`).
- **Testing in a real browser, or by hand, only ever happens on the throwaway QA copy (`npm run qa`), never on the dev copy or the always-on app.** (Decided 2026-10-23, after a hand test on the dev copy had to be undone by hand afterwards.)
  - It copies your data (the real database once it exists, otherwise `dev.db`, with its avatars and the theme art) into a fresh temporary folder and serves it on its own ports. Backups and the Nexon refresh are off. Ctrl+C stops it and deletes the copy. `npm run qa -- --empty` starts with no data.
  - **Test on http://127.0.0.1:4753: the production build, as the always-on app serves it.** It's built when the QA copy starts, so restart the QA copy after changing the page. http://127.0.0.1:4754 is the development build, for watching changes live; it runs some code twice on purpose, which hid a production-only bug once (v1.0.0's Ren sky).
  - Anything goes in it: delete, reorder, odd histories, a broken database. Nothing needs undoing.
  - Searching and adding ask Nexon's real rankings (read-only, through the polite client), unless started with `--fake-nexon`: then a fake Nexon on this Mac (`server/scripts/fakeNexon.ts`, port 4755) answers, with made-up characters and controls to change or remove them. The app reaches it through `NEXON_RANKINGS_URL` and `NEXON_IMAGES_URL` (which may only point at this Mac).
  - **`npm run qa:check`** (`scripts/qa-check.mjs`) is the committed click-through: an empty QA copy with the fake Nexon, every button and edge case, a known 90-day history checked by hand, a level-up and a lost character through a real refresh. It depends on none of your data. **Each new feature adds its checks there.**
- **What gets which kind of check** (decided 2026-10-23: accuracy first, where it matters):
  - **Calculations and data handling** (`server/`, `shared/`, and the app's `client/src/lib/` and `client/src/api/`): tests worked out by hand, simulations, facts that must always hold, and **full mutation testing at 100% before each version**.
  - **The page** (`client/src/components/`, `client/src/pages/`): normal tests of what you see and click; **screenshots of every changed screen**; and **`npm run qa:check` before each version**. Not mutation-tested (it mostly pinned exact wording and class names).
  - **The always-on app's updates:** `app:restart` rehearses the new version on a copy of the real data first, and stops before touching anything real if the rehearsal fails.
  - **Reality checks**, which tests can't do (they share our assumptions): compare our numbers with real characters and another site after real use; re-check game figures after each GMS patch; check calculators against published examples.
  - **A review pass** (`/code-review`) on each version's changes before committing, for design-level mistakes tests don't find.
- **Mutation testing** (`/mutation-audit`): incremental while working, and a full run before each version is committed **when code it covers has changed since the last full run** (`git diff <last version tag> -- server/src shared/src client/src/lib client/src/api`; no changes there, no run). Incremental results go stale when a helper changes, so use `--force` then.
  - **Every mutant must be caught**, or, only if it provably can't change behavior, marked with `// Stryker disable next-line <Mutator>: <reason>` on the line above.
  - **Code that runs on import** makes a broken version look like a survivor, so open things on first use instead (`getConfig()`, `db()`).
  - **What's skipped:** the page's components and pages (see above), the app's class names and styles (`scripts/stryker-ignore-looks.mjs`), and `client/src/looks/`. Looks are checked on screenshots.

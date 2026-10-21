# Changelog

Every version gets an entry here, the same `version` in every `package.json`, and an annotated tag `vX.Y.Z`.

## v0.3.0 (2026-10-21): game figures, EXP math, and the EXP table tab

- **The EXP table tab:** the GMS EXP needed for every level from 1 to 299.
  - Ranges: 1–199, 200–299 (the default) and All.
  - Jump to a level: marks the row and scrolls to it, switching ranges if needed.
  - Each row: the exact EXP, the short form, the change from the level before (big jumps in red) and the total from level 1. The header row stays visible while scrolling.
  - It says the table is current as of GMS v.271.
- **Game figures** (`server/src/gameFigures/`): the worlds (Kronos 45, Hyperion 70) and the GMS EXP table, with sources. A test confirms that v.271's announced cuts for levels 210–259 turn the old GMS table into this one, and that no other level changed.
- **EXP math** (`server/src/calc/`):
  - total EXP and its reverse
  - progress through a level
  - EXP to reach a level
  - UTC days and the next 00:00 UTC
  - time to the next level and to the next multiple of 5

  Impossible progress is refused.
- **Formatting** (`client/src/lib/format.ts`): EXP to 3 significant digits, durations and future dates.
- **`/api/exp-table`.**
- **GitHub workflow:** the checkout and Node setup actions moved to v7, replacing the retiring versions.
- **Tests:** 131 server and 69 app tests, in California time and UTC. Mutation testing: server 419/419, app 300/300.
  - Mutation runs and deliberate bugs exposed untested behavior, now covered: impossible progress passed straight into `totalExp` and `progress`; scrolling to a jumped-to row; jumping at the edges of the ranges; an invalid jump leaving everything else alone; only one range button showing as chosen; and a +50% change not being marked as a big jump.
  - One of my hand-calculated expected values was wrong (+130.8% instead of +131.7%), not the code, and was corrected.

## v0.2.0 (2026-10-21): the skeleton

The first app code: a working website with the feature tabs and the two themes, its API, and the full test setup.

- **The app:** feature tabs down the left edge (Home, four TBD tabs, then the EXP table and Themes at the bottom), each with its own address. Home and the EXP table are placeholders for now.
- **Themes:** Ren (the default) and Pochacco, saved on the server. The Themes tab shows each theme's own preview.
  - Theme art lives in the data folder (never in git), and each theme uses its own art when present.
  - Ren otherwise draws a moonlit blossom tree with falling petals; Pochacco shows gingham.
- **API:** `/api/health`, `/api/settings` (the theme) and `/api/theme-art`. Errors always come back as clear JSON. Big numbers are sent exactly, or refused.
- **Settings in one place** (`server/src/config.ts`). It refuses: a test run without a throwaway database, or with one inside the real data folder; addresses other than this Mac (except Docker with `MIKU_IN_CONTAINER=1`); bad ports; and on/off typos.
- **Database:** Prisma 7 with SQLite and the first table (`Settings`, one row per owner). `npm run db:migrate` works on `dev.db`.
- **Commands:** `npm run dev` (dev copy on 4751/4752 with `dev.db`) and `npm start` (port 4750, real database).
- **Tests:** 76 server and 24 app tests, in California time and UTC.
  - Server coverage is 100%.
  - Mutation testing: server 261/261, app 106/106, with three mutants marked as provably harmless, each with its reason.
  - The GitHub workflow runs the typecheck and tests on version branches.
- **Fixed during this version:**
  - The test-database guard would have treated a folder named like `..cache` as outside the real data folder.
  - In the Pochacco theme, the Ren card's preview showed Pochacco's art.
- **Docs:** `DESIGN.md` (how it works now) and `CLAUDE.md` (how we work). The `PLAN.md` updates from v0.1.1 onward: the leveling line chart, the data-size check and the Docker check after v1.0.0; keeping saved data forever; and Stryker moved to the start.
- **Research:** `scripts/nexon-watch.mjs` logs when Nexon's rankings update, to pick the daily refresh time.

## v0.1.1 (2026-10-20): plan updates

- `PLAN.md`: added avatar history (seeing each character's old looks) to "After v1.0.0". From v0.5.0, avatar images are saved under a name taken from their contents and never overwritten, so the history needs no rework later.
- `PLAN.md`: the rankings are expected to update more than once a day. The update watch at the start of v0.2.0 now only picks the time of the daily refresh.

## v0.1.0 (2026-10-20): planning and mockups

No app code yet.

- `PLAN.md`: what v1.0.0 includes, the versions and steps to get there, the testing done at every step, risks, decisions, and research (Nexon's rankings data, the GMS EXP table current as of v.271, reset times).
- `docs/theme-examples/index.html`: the approved mockup. It has the left tab rail, Home in separate sections, character tabs, the daily EXP chart, time to level, the EXP table tab with the real GMS table, and the Ren and Pochacco themes.
- `README.md` and `CHANGELOG.md`.
- `.gitignore` (which keeps `tempdata/` and theme art out of git) and `.claude/settings.json` (the commands Claude may run without asking).

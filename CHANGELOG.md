# Changelog

Every version gets an entry here, the same `version` in every `package.json`, and an annotated tag `vX.Y.Z`.

## v0.8.0 (2026-10-21): the character view

- **The EXP section, below the selected character:** EXP over the last 7 days, the daily average (14 days) and the best single day, with its date.
- **The daily EXP chart:** one bar per finished UTC day for the last 14 (today isn't finished, so it isn't a bar).
  - Each bar has its amount above it ("5.60T", or "0" for a checked day without EXP), its day below, and its exact EXP in a tooltip (mouse or keyboard).
  - A day that wasn't checked is a hatched "no data" stub. Its EXP lands on the next checked day, marked "2 days", and such a combined bar is never the best day.
  - A round-numbered scale, and a dashed line at the daily average with its legend.
  - "New day in 20h 49m 05s · 00:00 UTC is 5:00 PM your time", counting down each second. At 00:00 UTC the chart is fetched again, so yesterday's bar appears.
  - With no history yet: no scale, and a note saying the first bar appears once a full UTC day has been checked.
- **Time to level:** at the daily average, the time to the next level and the next multiple of 5, the EXP to go, and roughly when (in local time). A new character says "Not enough history yet"; one with no EXP in 14 days says "Not at this pace"; level 300 says there's nothing left.
- **Decided while building:** the daily average divides by the days actually tracked (up to 14), not always 14, so a newly added character's average isn't too low. With no snapshot in the last 14 days, there's no average.
- **The API:** `GET /api/characters/:id/progress` (bars, stats and goals; 404 for another owner's character).
- **Tests:** 328 server and 147 app tests, in California time and UTC. Server coverage is 100%. Mutation testing: server 1081/1081 (plus 8 that looped forever and were stopped), app 809/809. The real data folder was unchanged by the full runs.
  - 8 deliberate bugs in the EXP math, the API and the chart were all caught.
  - Gaps the full runs found and now covered: the countdown's timer being stopped, the chart's grid lines, the best day's date note, and that only the chart is fetched again at 00:00 UTC. The snapshots' order now doesn't matter to the EXP math (it sorts them itself), with a test.
  - The countdown's effect is marked as not needing its list of inputs tested: the whole section is rebuilt for each character, so they never change.
  - **Fixed after looking at screenshots:** a squashed chart with missing dates, a meaningless "1, 1, 1, 0, 0" scale with no history, and "Not at this pace" shown for new characters.
  - **My mistakes along the way:** two hand-calculated dates in tests were wrong (the page was right, and one date depends on the time zone, so the test now expects each zone's own date); a test expected an average from month-old data; and a test counted the new progress requests as character-list requests.

## v0.7.0 (2026-10-21): the refresh (every 4 hours)

- **Every 4 hours, every character is looked up in Nexon's rankings again** (decided instead of once a day: a watch saw no ranking changes for hours, so when Nexon updates is unclear).
  - Checked when the server starts and every 15 minutes, so a sleeping Mac catches up. Runs never overlap.
  - Each check updates the character and today's snapshot, and downloads the avatar only when its look changed.
  - Only where `MIKU_REFRESH` is on (the always-on app from v0.9.0); `npm run refresh` does one by hand.
- **One snapshot per character per UTC day,** updated in place with the day's latest numbers. A day with no change still keeps its snapshot (0 EXP gained), so "didn't play" and "not checked" stay different.
- **Characters no longer found** (renamed, dropped out, or on the other world) are marked "not found since …", keep their history, and say so on Home. Found again, the mark goes.
- **When Nexon can't be reached or answers strangely,** the run stops at once, records why, and marks nobody missing. One character's EXP not fitting the table fails only that one.
- **Each run is recorded** (`RefreshRun`, `GET /api/refresh`). Home shows "Checked Nexon today at 08:03 UTC (1:03 AM your time)", or the problem.
- **Ranks have their own tiles:** world rank ("Kronos rank") and overall rank (all NA worlds), next to Legion and raid power.
- **Tried for real:** a refresh of the dev copy's two real characters updated both, keeping one snapshot each for the day.
- **Housekeeping:**
  - the `/mutation-audit` skill now describes the app's mutation testing, jsdom's limits and the data-safety rules
  - `npm run db:migrate -- --name …` now passes the name to the right command (it used to land on `prisma generate`)
  - the brief moved to `tempdata/`
  - the site isn't being made for phones for now (desktop only)
- **Tests:** 306 server and 125 app tests, in California time and UTC. Server coverage is 100%. Mutation testing: server 992/992 (plus 7 that looped forever and were stopped), app 638/638. The real data folder was unchanged by the full runs.
  - 9 deliberate bugs in the refresh and its display were all caught (the two local-day ones only in the California-time run, which is why every suite runs in both).
  - Gaps the full runs found and now covered: the refresh's tab order (my test added characters in an order that matched it), and recording a failure that isn't an error object.
  - **My mistakes along the way:**
    - an edit wrote a stray `\n` into `server/package.json`, which crashed the running dev copy until restarted
    - a test's fake served the same picture for a "new look"

## v0.6.0 (2026-10-21): the add-a-character box, improved

From using v0.5.0. The plan's later versions moved up by one: the daily refresh is now v0.7.0, the character view v0.8.0, and backups and the always-on app v0.9.0.

- **The + box opens directly below the +,** with matching left edges, above the sections under it. Before, it was hidden behind the next section and opened off the left of the page. Near the right edge it slides left to stay inside its section, and measures again when a result makes it wider.
- **The search result is a full preview** (layout C, chosen from five in `docs/add-character-mockup.html`, which is kept):
  - the character's **real avatar at 2×** (192 px, sharp pixels)
  - level, the EXP bar, world and overall rank, Legion and raid power
  - **Add <name>**

  The server downloads the avatar during the search and sends it as image data, so the page still never contacts Nexon.
- **Adding right after a search is instant:** the server remembers each owner's latest search (picture included) and uses it, with no new Nexon requests. A new search replaces it, adding uses it up, and after an hour it looks the character up again.
- **Legion is shared by a world's characters:** Nexon lists it under one character per account per world. Once that character is added, every character there shows its Legion ("listed under RemyRabbit"); until then it's **N/A**, with a hint.
- **Noted for after v1.0.0:** a separate tab to look up any character without adding it.
- **The box has a solid background** (in Ren, the text behind it showed through).
- **Tests:** 282 server and 116 app tests, in California time and UTC. Server coverage is 100%. Mutation testing: server 876/876 (plus 7 mutants that looped forever and were stopped), app 593/593. The real data folder was unchanged by the full runs.
  - **New tests:** the remembered search (used, replaced, used up, the other world, the hour), the shared Legion, the box's position and sliding (with made-up sizes, since the test browser can't lay out pages), and the preview.
  - **Fixed along the way:**
    - I accidentally deleted the box's Escape / click-outside code while changing it; the existing tests caught it.
    - Two survivors from the full runs: `forgetSearches` was untested, and the re-measure wasn't checked from an already-slid position.

## v0.5.0 (2026-10-21): characters on Home

- **Home has characters:**
  - the world switcher (saved)
  - character tabs with avatars: click to select; drag or Alt + ←/→ to reorder, shown at once and saved
  - **+** to search a name and **Add** it
  - the selected character's level, EXP bar ("86.92% to level 286 · 86.5T / 99.5T EXP"), ranks and Legion
  - **Delete**, which asks first and removes the history too
- **Adding looks the character up in Nexon itself**, saves its first snapshot, selects it, and downloads its avatar.
  - Duplicates are refused (named as Nexon spells them), even when added at the same moment.
  - A failed avatar download doesn't stop the add.
- **Avatars are saved in the data folder:** only from Nexon's https servers, checked to really be pictures, named after their contents, and kept for the planned avatar history. Unused files are removed after a delete.
- **New tables:** `Character`, `Snapshot`, `Avatar` and `Selection`. Tab positions are always 0, 1, 2… in each world.
- **API:** `/api/characters` (list, add, reorder, select, delete), and settings can save the world. `AVATAR_DIR` was added to the config. The Nexon client can download images, through the same polite queue.
- **Tried for real** in the dev copy: batterboi was added through the real API and Nexon, shown in both themes, then deleted (its avatar file was removed too).
- **Incident, found and fixed:** the real `theme-art/` folder, with the Pochacco picture from v0.2.0, was deleted, and an empty `fresh/` test folder appeared in the real data folder.
  - **Cause:** mutation testing broke `config.ts` so the data folder fell back to the real one. The config's guard only checked the database path, so a test's clean-up (`rmSync` of the theme-art folder) and a database test then worked in the real folder.
  - **No database was touched,** and the art was restored from `tempdata/`.
  - **The fix has three layers:**
    - test runs get a fake home folder, set in the test setup, which mutation testing never changes
    - the guard now covers every folder, against both the given and the account's own home
    - tests that create or delete files use the test setup's paths

    Reproduced first. Afterwards, four broken configs (including the guard switched off) and full mutation runs of server and app left the real folder exactly as it was.
  - **Follow-up found while checking:** in worker threads (how mutation testing runs tests), `os.homedir()` ignores a changed `HOME`, so the fake home only worked under plain `npm test`. The config now takes the home folder from `HOME` when it's set, and a test checks this; the suite also passes when run in threads.
- **Prisma 7:** `migrate dev` no longer regenerates the database code, so `npm run db:migrate` now does it.
- **Tests:** 266 server and 105 app tests, in California time and UTC. Server coverage is 100%. Mutation testing: server 820/820 (plus 6 mutants that looped forever and were stopped), app 557/557.
  - Mutation runs and deliberate bugs found many untested behaviors, all now covered. Among them:
    - an old look returning as the current avatar
    - each character showing its own avatar
    - closing the gap after deleting a middle or first tab in either world
    - Alt + arrow not triggering the browser's own Back/Forward
    - the + box starting clean
    - Home while loading
    - errors during saving other than duplicates
  - **Corrected along the way:**
    - two "saves nothing" tests that checked before anything could have been sent
    - one test that compared a list with itself
    - one drag test that expected the wrong order (the code was right)
    - my claim that a missing avatars folder crashed delete (it didn't: the guard was already there, just untested)

## v0.4.0 (2026-10-21): the Nexon rankings client

- **Looking a character up** in Nexon's public rankings on Kronos or Hyperion (`server/src/nexon/`).
  - Three requests: the world board (level, EXP, job, avatar, world rank), the overall board (overall rank among all NA worlds) and the Legion board (Legion level and raid power, or "not listed").
  - The result uses Nexon's spelling of the name.
- **Every reply is checked:** sensible levels, EXP and ranks, and avatars only from Nexon's own https servers. EXP that doesn't fit the EXP table is reported, because a GMS patch may have changed the table.
- **Clear errors:** on the other world ("SakuraRin is on Hyperion, not Kronos."), not in the rankings, unreachable (retried twice, waiting 2 s then 6 s), changed shape, and EXP table mismatch.
- **Polite:** one request at a time, at least 1.5 s apart, even when two lookups happen at once, with a 15 s timeout.
- **`/api/search?world=…&name=…`.** Names must be 1–12 letters and numbers, and worlds 45 or 70; bad input is refused without asking Nexon.
- **`npm run nexon:check -- <name> [world]`:** a live check by hand. It was run against the real rankings: found on Kronos, "on Kronos, not Hyperion", and "not found" all behaved as expected.
- **The worlds moved to `shared/`** (the app will show their names), and `NEXON_RANKINGS_URL` was added to the config.
- **Tests:** 203 server and 69 app tests, in California time and UTC. Server tests can't reach the network: any real request fails loudly. Mutation testing: server 594/594 (plus 6 mutants that looped forever and were stopped, which counts as caught), app 300/300.
  - Deliberate bugs and mutation runs exposed gaps, now covered:
    - the "one request at a time" test's fake Nexon answered too fast to ever overlap
    - the real client's parts were untested
    - an error status with a normal-looking body
    - a pause of exactly zero
    - the default location of the built app
  - One test of mine waited through real retry pauses (about 10 s), and was removed because a quicker test already covered it.

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

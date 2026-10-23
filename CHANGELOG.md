# Changelog

Every version gets an entry here, the same `version` in every `package.json`, and an annotated tag `vX.Y.Z`.

## v1.1.0 (2026-10-23): the level line

- **"EXP per day | Level"** at the EXP chart's top left (layout B of five mockups) swaps the chart between the daily EXP bars and **the level line**. The range, boxes, dates and countdown stay the same, and each view has its own heading.
  - **The line:** the level on each checked day, with progress through the level (278 at 93% is 278.93), so it climbs smoothly between level-ups. Nothing new is collected: it comes from the totals already saved.
  - **Highlighted dots** (gold in Ren, pink in Pochacco) mark level-ups. A level-up on a day that wasn't checked shows on the next checked day, whose tooltip says "reached 278 since the last check (Oct 19)". Today is a white dot, and up to 14 days every checked day gets a small dot.
  - **The scale** is rounded out to quarter levels ("278 · 25%"), with lines every quarter, level, or few levels, and never above level 300.
  - Each day has a tooltip ("Lv. 278 · 93.00%", rounded down so an unfinished level never shows 100.00%).
- **Fixed: a range reaching level 300 counted it as 301**, crediting an extra level to its "% of a level a day" (since v0.9.0). Found while building the line.
- **Dropped from the plan for now: the Lookup tab.** Per-day EXP for characters we don't track isn't possible without checking them over and over at scale, which means getting around Nexon's limits (as open-source scrapers do). Noted under "Later", with how it could come back. The versions after it moved up one. The plan's Bosses version gained research on MapleScouter (KMS-only; an open-source reverse-engineering of its boss maths exists, without a license).
- **The level cap (300) now lives in the shared package**, used by the EXP table and the page alike.
- **From the review pass** (9 findings, all fixed):
  - The line's points sat slightly off their day columns, and at 90 days a narrow window could scroll sideways. The level chart's columns are now gapless, and the line shares their box.
  - The note said "gold dots" (they're pink in Pochacco).
  - A level-300 character got a "300 · 25%" line.
  - 99.996% showed as "100.00%". My first fix showed 278.2 as "19.99%", because of how 278.2 is stored, and a test caught it.
  - An inconsistent record (more gained than its total) would have made the whole EXP section fail. Its gain is now ignored. My first guard invented level-ups from level 1, and a test caught that too.
  - Duplicated date formatting.
  - The page hard-coded 300.
  - The switch sat inside the chart's heading, so screen readers read the buttons as the title.
- **Tests:** 373 server and 177 app tests, in California time and UTC. Mutation testing on the changed code: 100%. `qa:check`: 118/118, with new checks for the Level view (against a hand-worked 90-day history), a narrow window, and points lining up with their days.
  - **My mistakes along the way:** test expectations that compared levels exactly (EXP-built fractions are a hair off), used fractional EXP, or miscounted which days are in "7 days". I also first drew dots on every day at 90 days, which crowded the line.

## v1.0.1 (2026-10-23): testing that doesn't depend on your data, and safer updates

From a look at how we test: what was redundant, and what was weak.

- **`npm run qa:check`, the click-through, is now part of the project** (it used to be a throwaway script of mine that expected your data's numbers). It starts an empty QA copy with a **fake Nexon** and checks the production build in Chrome. 111 checks:
  - every page and button, and the edge cases (name rules, not found, the other world, numbers that don't fit the EXP table, level 300, the shared Legion, reordering at both ends, delete and cancel, the EXP table's jumps, both themes, and the Ren sky after switching)
  - a known 90-day history, checked against hand-worked numbers
  - a real refresh with a level-up and a character that vanished
  - eight kinds of failure, bad requests, and a narrow window

  It caught the Ren bug when that was put back on purpose.
- **The fake Nexon** (`server/scripts/fakeNexon.ts`): made-up characters on this Mac, answering like the real one, with real little avatar pictures and controls to change or remove characters. No internet, nothing sent to Nexon. Also for hand tests: `npm run qa -- --fake-nexon`. It needed one setting, `NEXON_IMAGES_URL`, which only accepts an http(s) address on this Mac.
- **`app:restart` rehearses first.** It tries the new version on a copy of your real database (on port 4756), updating it and loading every character, and stops before touching anything real if that fails. `npm run app:rehearse` does only that. Tried for real: on your data, with the port taken, and interrupted with Ctrl+C (nothing left behind).
- **The GitHub check builds the production page too**, so a broken build shows there, not at `app:restart`.
- **Testing rules** (`CLAUDE.md`):
  - no separate coverage step (100% mutation testing implies it)
  - hand-planted bugs only where mutation testing doesn't reach
  - page tests check what's shown and what happens, not exact wording (except where the words matter)
  - `qa:check` before every version, and each new feature adds its checks there
- **From the review pass** (10 findings, 9 fixed):
  - **My mistake:** while adding the rehearsal I'd moved the step that waits for the updated app to answer, so `app:restart` would no longer tell you whether the app came back up.
  - An old rehearsal server left on its port could have answered for a broken new version; the rehearsal now refuses a taken port and checks it's still its own server answering.
  - Ctrl+C during a rehearsal left its server, the copy of your data and the new build behind.
  - A failed start hid the new version's output.
  - The rehearsal copied avatars and theme art it never used.
  - Smaller: a raw error instead of a clear one, the images setting accepting `file://` addresses, `qa:check` not saying when the QA copy didn't start, and the fake Nexon crashing on malformed requests.
  - Not changed: the rehearsal and the QA copy each keep their own list of "isolate everything in a temp folder" settings (one is TypeScript, the other plain JavaScript); comments in each point at the other.
- **Tests:** 364 server and 167 app tests, in California time and UTC. Mutation testing on the changed code (the new setting and the image address): 100%. `qa:check`: 111/111.
  - **My mistakes along the way:** fake data with more EXP than its level holds (the app rightly refused it; it's now a deliberate check), and a refresh expectation that forgot the other world's characters.

## v1.0.0 (2026-10-23): first real use

The always-on app is in real use, with RemyRabbit and meowoblush tracked from 2026-10-23.

- **Fixed: switching to the Ren theme drew the blossom background in black** (a black tree without blossoms, black petals, a faded moon) until a reload. Reported from real use. The background started a moment before the page switched to Ren's colors, which only Ren's settings define, so it read blank colors. Now the background carries Ren's colors itself (whatever the page's theme), and the page also switches theme before anything on it starts. It only happened in the production build that the always-on app runs. Checked on the production build, including with the second layer taken out.
- **`npm run qa` now tests the production build** (http://127.0.0.1:4753, as the always-on app serves it); the development build (4754) runs some code twice on purpose, which is why my click-through missed the bug above. The rule in `CLAUDE.md` says so.
- **The README** is rewritten for using the app: what it does, where the numbers come from (history starts when a character is added; Nexon updates its rankings on its own schedule), the always-on app's commands, backups and how to restore one, and the dev and QA copies.
- **The EXP table was re-checked:** GMS is still on v.271, whose EXP cut it includes; v.272 (November) isn't out yet, and gets re-checked when it is.
- **From the review pass** (9 findings, 6 real): the Ren fix no longer depends on the order things start in (above); `npm run qa` now stops its build too if stopped during it, and says the production page is built once (restart after changes); the README's backup restore now says to delete SQLite's leftover side files; and the addresses say `127.0.0.1:4750`, where the app actually listens (`localhost` works in browsers but not every tool). Not changed: a "stale colors" case that can't happen (the sky only shows in Ren), and the QA copy's build, which takes a third of a second.
- **Decided: nothing waits on real data.** Bugs noticed in use are fixed in whichever version is open, and the reality checks (Nexon's lag, our EXP per day against another site) happen once there's data.
- **Tests:** 362 server and 167 app tests, in California time and UTC.
  - New: the page is already Ren's when the background starts (fails on the old code), and the background is marked as Ren itself.
  - No mutation run: nothing it covers changed since v0.10.0's full runs (100%). The rule now says so: a full run before a version only when covered code changed.
  - The click-through on the production build passed, apart from one check where my script expected the dev copy's older rank numbers (the QA copy now copies the real database, which has the current ones). On the production build the petals kept falling through every way of switching themes.

## v0.10.0 (2026-10-23): backups and the always-on app

- **The always-on app.** A macOS launch agent starts MikuTracker at login and again if it stops, on http://localhost:4750, with the real database. It runs from its own copy of `main` in the data folder's `app/`, with backups and the 4-hourly Nexon refresh on.
  - **Commands:** `npm run app:install` / `app:restart` / `app:status` / `app:uninstall`. A restart backs up, copies `main`, migrates, builds and swaps the copy in.
  - Its log is `~/Library/Logs/MikuTracker/app.log`.
  - `npm start` is gone.
- **Daily backups** of the real database, made with SQLite's own backup and named by the UTC day.
  - **When:** at start if there's none from today, then checked hourly; before every install or restart (`…-before-update.db`); and by hand with `npm run backup`.
  - **Kept:** the newest 30, plus the first of each month for 12 months (about 42 at most).
  - Decided not to add a "back up now" button or a "start over empty" command.
- **Bugs found and fixed:**
  - **The dev copy and the real app would have shared one `avatars/` folder,** so deleting a character in one would have deleted the other's pictures. The dev copy now has its own `dev-avatars/` and `dev-backups/`, and its two existing pictures were moved.
  - **One interrupted backup would have blocked backups for the rest of that day:** its half-written temporary file made SQLite refuse the next try. It's now cleared first. (Goal Tracker has the same bug.)
  - **Deleting a character right after a move that went nowhere** (Alt+→ on the last tab, or a drag dropped where it started) **crashed the page to blank.** Found by testing every button by hand; the tabs now ignore a leftover order that doesn't list exactly the current characters.
  - **"Failed to fetch"** (the browser's words when the server can't be reached) now reads "Couldn't reach MikuTracker's server. Is it running?".
  - **From the review pass** (`/code-review`, 10 findings, 9 real; the tenth, reading the backups folder twice, isn't worth changing):
    - `app:restart` moved the running app's libraries into the new copy before it was ready, and migrated the database and deleted the old files while the old app was still running. It now builds the new copy with the running app untouched (libraries cloned), and only then stops, backs up, migrates and swaps; a failure restarts the old app.
    - A before-update backup counted as the day's backup, so an update day got no regular one. Now only a regular one counts.
    - The dev copy's own folders were chosen from `MIKU_DATABASE` only, so `DATABASE_URL` pointing at `dev.db` would have used the real backups and avatars. Now decided by the database file.
    - A reorder the server failed to save stayed on screen as if saved; it now goes back to the saved order (the error shows). An unchanged order no longer leaves a draft behind at all.
    - `npm run qa`: a failure exited as success, its tsx and vite processes could outlive it and keep the ports, and a failed copy left its folder behind. All fixed and tried for real.
    - Finding Node for the launch agent no longer crashes `app:status` or `app:uninstall` when `which node` fails.
- **New way of testing** (decided 2026-10-23, written into `CLAUDE.md`):
  - **`npm run qa`:** a throwaway copy of the app (your data copied into a temporary folder, its own ports 4753/4754, deleted when stopped). All testing by hand or in a browser happens there, never on the dev copy or the always-on app.
  - **Mutation testing now covers the code where accuracy matters:** server, shared, and the app's `lib/` and `api/`. The page's components are checked with normal tests, screenshots, and a click-through of every button on the QA copy before each version. Also reality checks against real data, and a review pass before each commit.
- **The plan after v1.0.0** now has its own version for everything, each to be discussed before building: Lookup tab, leveling chart, avatar history, Docker check, data size check, weekly boss tracker, daily and weekly checklist, symbols, HEXA, gear tab, flame / potential / Star Force calculators (v2.0.0+), and bosses (v3.0.0). Export and login are noted for later.
  - Version numbers now go by importance (`CLAUDE.md`).
- **Tests:** 362 server and 165 app tests, in California time and UTC. Server coverage is 100%.
  - **Mutation testing:** server 1249/1249 (plus 8 that looped forever and were stopped); the app's logic 423/423 under the new scope. The real data folder was unchanged by the full runs.
  - **The launch agent's settings file** is read back by macOS's own `plutil`.
  - **9 deliberate bugs** in backups, the launch agent and the folders: 8 were caught at first, and the ninth (a backup written straight to its final name) led to the new interrupted-backup test, which found the bug above.
  - **The by-hand click-through:** 112 checks of every button, page and edge case (adding level-300 Kraane, name checks, not found, wrong world, reordering at both ends, delete and cancel, the EXP table's jumps, both themes, eight kinds of failure, bad requests to the server, a narrow window). All pass after the fix.
  - **My mistakes along the way:** four failures in my first click-through were my script's (a wrong search address, two buttons sharing a style, reading the highlight a split second early). I had also tested on the dev copy and restored it by hand, which is why the QA copy exists now.

## v0.9.0 (2026-10-21): EXP ranges, and today's bar

From using v0.8.0. Backups and the always-on app move to v0.10.0.

- **Today's bar grows with each check of Nexon** (every 4 hours), instead of the chart showing only finished days.
  - Each check now adds the EXP gained since the check before to the day's saved `gained`. The first check of a day counts from the last check before it.
  - A character added this morning shows its EXP after the next check, instead of waiting for tomorrow.
  - **When a check finishes,** the page loads the characters and the chart again by itself.
  - **Existing saved days** were filled in by the `daily_gained` migration from the day before's total (0 for each character's first day). Tried on a throwaway database and on `dev.db`.
- **7, 14, 30 and 90-day ranges** (layout B of the mockup) replace the three stats. Each range's box shows:
  - the daily average
  - the share of a level gained a day ("+20.5% a day", across level-ups)
  - the total EXP

  Today counts in every range. Clicking a box, or the buttons at the top right of the chart, picks a range: the chart shows that many bars, the average line is that range's, and **Time to level uses its average**.
  - At 30 bars the amounts are smaller; at 90 they're only in the tooltips. The dates thin out and always include "Today".
  - The best-day stat is gone (it isn't in the chosen layout).
- **No meaningless scale** when every day is 0 or "no data".
- **Noted for after v1.0.0:** a gear tab (each piece with its flame and flame score, stars and potential) and, maybe, an upgrade advisor using MapleScouter's information, depending on what it allows.
- **Tests:** 337 server and 159 app tests, in California time and UTC. Server coverage is 100%. Mutation testing: server 1105/1105 (plus 8 that looped forever and were stopped), app 902/902. The real data folder was unchanged by the full runs.
  - 12 deliberate bugs in the checks, the ranges, the page and the reloading were all caught.
  - **Gaps the full runs found, now covered:**
    - another character's checks on the same days
    - three days of checks in a row
    - a character added and not checked again until the next day
    - a snapshot for a character with none yet
  - **Removed as unnecessary:** two conditions in the reloading and the history check, which could never change what happens.
  - **My mistakes along the way:**
    - a test expectation that put a check inside the 7 days when I meant just before them
    - a time-to-level figure worked out wrong by hand (8.7 months instead of 8.6)
    - a made-up level curve in the mockup that ran forever at 90 days
    - a test file that didn't save on the first try

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

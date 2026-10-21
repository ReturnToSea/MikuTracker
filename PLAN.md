# Plan

What we're building for v1.0.0, the versions and steps on the way there, the decisions behind them, and research findings. When a part is built, its description moves into `DESIGN.md` (added with the first code; it describes how the app works **now**), and this file keeps only what's next.

## v1.0.0 in one paragraph

A local website, always running on this Mac, that tracks GMS characters on **Kronos** and **Hyperion**. You add a character by searching its name. Once a day, after 00:00 UTC, the app looks every character up in Nexon's public rankings data and saves a snapshot. From those snapshots it shows:
- level and EXP progress, as a percentage and as have / needed
- ranks and Legion
- a bar chart of EXP gained per UTC day
- the 7-day total, the 14-day daily average and the best day
- the estimated time to the next level and to the next multiple of 5

An EXP table tab shows the current GMS EXP for each level. Two themes (Ren and Pochacco) can be switched in a Themes tab. The approved look is the mockup in `docs/theme-examples/index.html`.

## What v1.0.0 includes

**Layout** (as in the mockup)
- Feature tabs down the far left edge of the screen: Home and the **TBD placeholder tabs** at the top (each opens a "still to be decided" page), EXP table and Themes at the bottom.
- Home is split into separate sections: world switcher and character tabs; character and stats; daily EXP chart; time to level. Small corners, no single surrounding box.

**Worlds and characters**
- World switcher: Kronos (ID 45) and Hyperion (ID 70). Each world keeps its own characters and remembers which one was selected.
- Adding: **+** at the end of the character tabs opens a search box. Search for a name, see the result (avatar, level, job, world), then click **Add**. Clear messages for each case:
  - not found in the rankings
  - on the other world
  - already added
  - Nexon unreachable
- Character tabs show the icon, name, level and job. Click to switch; drag left and right (or Alt + ←/→) to reorder. The order is saved.
- Deleting asks first, and also deletes the character's history.

**The character view**
- Avatar, name, job, world, overall rank and world rank.
- Level, with an EXP bar: "86.91% to level 286 · 86.5T / 99.5T EXP".
- Legion level and raid power: the character's own Legion lookup, since Legion belongs to the account.
- Stats: EXP over the last 7 days, the 14-day daily average, and the best day.
- **Daily EXP chart:** one bar per finished UTC day for the last 14 days, with the amount above each bar, a dashed 14-day average and a hover/focus tooltip. A live countdown shows when the next UTC day starts, in local time, and the chart moves on by a day at 00:00 UTC.
- **Time to level**, at the 14-day daily average: to the next level, and to the next multiple of 5 (207 → 210, 285 → 290). Each shows the EXP still needed, the time ("≈ 4.3 days", "≈ 5.6 months") and an estimated date. It handles "no EXP in 14 days" and level 300.

**Daily refresh**
- Once a day after 00:00 UTC (the exact time depends on when Nexon updates; see Risk 1). It catches up on start-up or wake if it was missed. It's checked hourly while the app runs, like Goal Tracker's backups.
- One character at a time with a short pause between requests, a timeout, and a couple of retries.
- Every Nexon response is checked against the shape we expect. A changed shape is reported, not saved.
- A snapshot is saved only when the data changed. On failure the last saved data stays on screen, with "Updated …" or the error shown on Home.

**EXP table tab:** levels 1–299 from the GMS table (see the game figures below). Range buttons (1–199, 200–299, All), jump to a level, the short form, the change from the level before, the total from level 1, and a header row that stays visible while scrolling.

**Themes tab:** Ren (the default) and Pochacco, saved as a setting.
- Theme art (Pochacco's background, and Ren's later) lives in the data folder, never in git. The app serves it from there.
- Without the art, each theme falls back to its own drawn background: Ren's ink tree with petals, Pochacco's gingham.

**Behind the scenes**
- **Backups:** daily, plus before every database update. Kept: the newest 30 plus one per month for 12 months.
- **Always-on app:** a macOS launch agent runs it from its own copy of `main`. Commands: `app:install`, `app:restart`, `app:status`, `app:uninstall`, `app:fresh-start`.
- **Two databases:** the real one (`miku.db`) and a dev one (`dev.db`), both in `~/Library/Application Support/MikuTracker/`.
- Only listens on `127.0.0.1`. No analytics. The only outside requests are to Nexon (rankings and avatars) and Google Fonts.

## How the code is organized (same pattern as Goal Tracker)

- `shared/`: zod input rules used by the server and the app (character search, add, reorder, settings).
- `server/src/config.ts`: **every** setting in one place, from environment variables with local defaults: data folder, database file, backup folder, theme-art folder, host, port, whether backups and the daily refresh run, and the refresh time.
- `server/src/gameFigures/`: the worlds and the GMS EXP table, each figure with its source and patch/date.
- `server/src/calc/`: pure calculations, with no database and no HTTP:
  - UTC days and the next 00:00 UTC
  - converting level + EXP into total EXP
  - EXP gained per UTC day from snapshots
  - stats
  - time to the next level and the next multiple of 5
- `server/src/nexon/`: the rankings client. It builds the request, fetches, checks the response with zod, and turns it into our own shape. `fetch` is passed in, so **tests never reach the real Nexon**: they use a fake with saved sample responses.
- `server/src/services/`: connect the database to `calc/` and `nexon/` (characters, snapshots, refresh, settings).
- `server/src/routes/`: the API. `server/src/owner.ts`: the one place that says whose data this is.
- `client/src/api/`: the only place the app talks to the server. `client/src/lib/`: display logic as plain tested functions (EXP formatting, durations, chart scaling). `components/` and `pages/` are mostly layout.

**Database (Prisma, SQLite):**
- `Character`: owner, world, name, the name in lowercase for finding duplicates, job, latest level and EXP, avatar, tab order, added time, last refresh result.
- `Snapshot`: character, captured time, UTC day, level, EXP, total EXP, ranks, Legion level, raid power. Big numbers use `BigInt`.
- `Settings`: theme, selected world, selected character per world.
- `RefreshRun`: when each daily refresh ran, and what happened.
- Deleting a character deletes its snapshots.

## Testing at every step

Each step below ends with all of these done and passing:
1. **Tests for every new behavior.** Prefer checks that don't reuse the code under test: hand-computed values, step-by-step simulations, and facts that must always hold (for example, the daily gains add up to the total change).
2. **Every new test is shown to fail on the old or broken code** before it's trusted.
3. `npm test` (server, then app, each in California time and in UTC) and `npm run typecheck`.
4. **Incremental Stryker** on the code the step touched, with `--concurrency 2` and `nice -n 19`, until every mutant is caught. A mutant is only disabled with a written reason, and only if it provably can't change behavior.

Before each version is committed: `npm run test:coverage`, a **full** Stryker run of the server and the app, a CHANGELOG entry, matching `version` in every `package.json`, and a version number you've agreed to. Then push the version branch so the GitHub checks run. You push `main` and the tags.

Rules carried over from Goal Tracker:
- Tests use a throwaway database, and the code throws if a test run has none.
- Only `Date` is faked, starting from a fixed time.
- API tests use one server per file, bound to `127.0.0.1`.
- No test ever touches the network.
- This Mac has 8 GB of memory: at most two mutation runs at once, and nothing else heavy alongside them.

## Versions and steps

### v0.1.0: planning and mockups (this save)
`README.md`, `PLAN.md`, `CHANGELOG.md`, `.gitignore`, `.claude/settings.json`, and the approved mockup in `docs/theme-examples/`. No app code.

### v0.2.0: the skeleton — done
Built and described in `DESIGN.md`; see `CHANGELOG.md`. Still running: the **Nexon update watch** (`scripts/nexon-watch.mjs`, research only), started 2026-10-21 03:35 UTC on the top 5 of that week's EXP ranking. Check it with `node scripts/nexon-watch.mjs --summary`; its result picks the daily refresh time in v0.7.0. As of 04:06 UTC: no changes in about 1.5 hours.

### v0.3.0: game figures, EXP math, and the EXP table tab — done
Built and described in `DESIGN.md`; see `CHANGELOG.md`.

### v0.4.0: the Nexon rankings client — done
Built and described in `DESIGN.md`; see `CHANGELOG.md`.

### v0.5.0: characters on Home — done
Built and described in `DESIGN.md`; see `CHANGELOG.md`. (The `Snapshot` table and the first snapshot on adding came in this version; v0.7.0 adds the daily ones and `RefreshRun`.)

### v0.6.0: the add-a-character box, improved — done
Not in the original plan: came from using v0.5.0. Built and described in `DESIGN.md`; see `CHANGELOG.md`. (The later versions moved up by one.)

### v0.7.0: the refresh (every 4 hours) — done
Built and described in `DESIGN.md`; see `CHANGELOG.md`.

### v0.8.0: the character view — done
Built and described in `DESIGN.md`; see `CHANGELOG.md`. (The daily average divides by the days actually tracked, up to 14, instead of always 14 as first planned, so a newly added character's average isn't too low.)

### v0.9.0: EXP ranges, and today's bar — done
Built and described in `DESIGN.md`; see `CHANGELOG.md`. (From using v0.8.0: today's bar grows with each check, and 7, 14, 30 and 90-day ranges replaced the three stats. Layout B of the mockup.)

### v0.10.0: backups and the always-on app
1. Backups, adapted from Goal Tracker: daily, before database updates, and kept for 30 days plus 12 months.
2. The launch agent and `app:*` commands on port 4750, from its own copy of `main`, with the real database; `npm run dev` on 4751/4752 with `dev.db`.
3. The daily refresh runs only in the always-on app.
4. Tests: as in Goal Tracker (the settings file, which backups are kept, the copy is made under a temporary name first).

### v1.0.0: first real use
Use it for a few days, fix what comes up, re-check the EXP table against the latest GMS patch, do the full mutation runs, and update `README.md` with how to run it.

## After v1.0.0

- **Avatar history:** every avatar a character has had is kept, so you can look back at its old looks, with the date each one first appeared. (The image files are already kept from v0.5.0; this adds showing them.)
- **Leveling progress line chart on Home:** level over time, in days, so you can see your leveling progress. The line includes progress through each level, so 285 at 86.91% plots as 285.87 and the line climbs steadily between level-ups instead of jumping in steps. It comes from the saved snapshots (one point per UTC day), so nothing new needs collecting.
- **Docker check:** a Dockerfile and compose file, plus a check that the app runs in a container. Data lives on a volume (`MIKU_DATA_DIR=/data`), with `HOST=0.0.0.0` and `MIKU_IN_CONTAINER=1`, the port published only to `127.0.0.1`, and `restart: unless-stopped` doing the launch agent's job. This proves the move off the Mac works before it's needed. (Moving to Postgres is separate: it needs a fresh starting migration, and `pg_dump` for backups.)
- **Look up any character, without adding it:** its own tab (for example "Lookup"), to search any GMS character on Kronos or Hyperion and see its details (avatar, level, EXP, ranks, Legion) without adding it to your characters. It uses the same server search as the + box.
- **Gear tab:** save each piece of a character's gear by hand (Nexon's rankings don't include gear, and reading the game is off limits).
  - Per piece: the slot and item, its **flame** (bonus stats) with a **flame score**, its **stars** (Star Force), and its **potential** and bonus potential (tier and each line).
  - **To research first:**
    - the flame score formula (it depends on the class's main stat, and guides weigh attack and all-stat % differently)
    - GMS's current Star Force limits and the stats each star gives
    - the potential lines and tiers available per slot

    Like the EXP table, these get recorded with their source and patch.
- **Maybe: an upgrade advisor tab**, using MapleScouter's information to work out the best next upgrade (which piece to flame, star or cube next).
  - **To research first:**
    - what MapleScouter offers for GMS, and whether it has an official way to use its data (an API) or terms that allow it
    - otherwise, whether its methods are published well enough to calculate the same thing ourselves

    No scraping a site that doesn't allow it. If neither works, the tab could link to MapleScouter instead.
  - It builds on the gear tab's saved gear.
- **Check the real data size:** after some real use, measure the database (snapshots), the avatar images and the backups folder, and compare them with the estimates (about 100 bytes per snapshot, so about 36 KB per character per year). Revisit the "keep forever" decision only if the real numbers are much bigger.

## Risks

1. **When Nexon updates the rankings.** You expect EXP to update more than once a day, so the daily chart is fine. The update watch in v0.2.0 still runs, to choose **when** the daily refresh should happen: soon enough after 00:00 UTC to have the previous day's EXP.
2. **The rankings data is undocumented** and could change or disappear. The shape checks, `nexon:check`, and showing the last saved data keep the app usable, and nothing is lost.
3. **Characters that rename or drop out of the rankings** stop being found. They're marked "not found since …" and keep their history until you delete them.
4. **EXP table changes in a patch** can make one day's bar wrong at the moment of the patch. The table records its patch, and it gets re-checked after each GMS patch.

## Open questions

None right now.

## Decided

- **Name:** MikuTracker everywhere: the app, the data folder (`~/Library/Application Support/MikuTracker/`), the shared package (`@miku/shared`), and the launch agent (`com.mikutracker.app`).
- **Region:** GMS. **Worlds:** Kronos (ID 45) and Hyperion (ID 70), both Heroic and both NA. The IDs come from the world list in Nexon's own rankings page code (2026-10-20).
- **Character data:** from Nexon's rankings data (see the research below). Anything else is manual. Nothing reads the game client.
- **Stack:** Express 5 + Prisma 7 (SQLite), a zod `shared/` folder, and React 19 + Vite + Tailwind 4, as in Goal Tracker.
- **Ports:** 4750 for the app, 4751 for the dev API, 4752 for the dev page. All three were free on 2026-10-20.
- **Changes from Goal Tracker:**
  - one config module
  - game time is UTC (shown in local time, and tested in both time zones)
  - big numbers are `BigInt` in the database
  - "whose data is this" in one place (`owner.ts`)
- **Themes:** only Ren (the default) and Pochacco for now. Colors only come from CSS variables. Art is never committed.
- **Saved as v0.1.0** (decided 2026-10-20): the planning docs and the mockup, with no app code.
- **Missing days in the chart:** empty "no data" bars, with the combined EXP on the next day that has data, labeled with how many days it covers.
- **Avatars:** saved locally by the server; the page never contacts Nexon. Old images are kept for the avatar history planned after v1.0.0.
- **TBD tabs:** shown as placeholders in v1.0.0.
- **Refresh every 4 hours** (decided 2026-10-21), not once a day: the watch saw no ranking changes for hours, so when Nexon updates is unclear. One snapshot per character per UTC day, updated in place.
- **Ranks:** world rank and overall rank (all NA worlds), shown in two separate places.
- **Not for phones for now:** desktop browsers only. Narrow windows still work, but phones aren't checked.
- **Saved data is kept forever** (decided 2026-10-20): one snapshot per character per UTC day, saved only when something changed, and never trimmed, because the charts are redrawn from it each time. Estimated at about 100 bytes per snapshot, about 36 KB per character per year. Avatar images: a new file only for a new outfit, all kept. Deleting a character still deletes its history. The real size gets checked after v1.0.0.
- **Rankings update often enough:** you expect EXP to update more than once a day. The watch only decides the refresh time.
- **Legion:** each character's own Legion lookup, since Legion belongs to the account.
- **Claude Code settings (`.claude/`):** as in Goal Tracker. `/mutation-audit` will be adapted when Stryker is set up.
- All the layout, chart, EXP and time-to-level decisions listed under "What v1.0.0 includes".

## Research

### Nexon's rankings data (unofficial, no key)

GMS has no official API: Nexon's Open API covers only KMS, TMS and MSEA. The rankings page on nexon.com loads its data from a public JSON address. Tested 2026-10-20:

```
https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na?type=overall&id=legendary&reboot_index=0&page_index=1&character_name=<name>
https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na?type=world&id=<worldID>&reboot_index=0&page_index=1&character_name=<name>
https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na?type=legion&id=<worldID>&page_index=1&character_name=<name>
```

Each entry has: `characterName`, `level`, `exp` (EXP into the current level), `rank`, `worldID`, `jobName` and `characterImgURL`, plus `legionLevel` and `raidPower` for `type=legion`.

| `type` / `id` | What it returns |
| --- | --- |
| `overall` / `legendary` | the all-time overall ranking |
| `overall` / `weekly` | a weekly ranking (what `gap` means there is unclear) |
| `overall` / `daily` | nothing |
| `world` / `<worldID>` | a ranking within one world |
| `legion` / `<worldID>` | Legion level and raid power |

Sites like MapleRanks most likely request this same data on a schedule and keep their own history. The Raycast MapleStory extension says it uses this data for NA and EU.

### GMS EXP table

Source: whackybeanz.com "Everything EXP", from its MapleSEA / KMS / TMS table (updated 3 June 2026). That table matches GMS after **v.271 (September 2026)**, which cut levels 210–259 by the same amounts as KMS in March 2026:

| Levels | Cut |
| --- | --- |
| 210–214 | ~8% |
| 215–219 | ~15% |
| 220–224 | ~21% |
| 225–229 | ~27% |
| 230–234 | ~33% |
| 235–239 | ~38% |
| 240–244 | ~43% |
| 245–249 | ~47% |
| 250–259 | ~58% |

- Checked against Nexon's v.271 patch notes and Namu Wiki's KMS values for levels 225, 230 and 239.
- The same site's "GMS" option still shows the table from before v.271.
- Above level 270 the site's two tables differ by a few hundred EXP out of trillions, which is rounding.
- The total from level 1 to 300 is 8,509,498,537,428,819, below JavaScript's exact limit of 9,007,199,254,740,992.

### Reset times (GMS)

From third-party guides that agree with each other; I couldn't find an official Nexon page.

| Reset | Time |
| --- | --- |
| Daily | 00:00 UTC |
| Weekly bosses | Thursday 00:00 UTC |
| Weekly quests | Monday 00:00 UTC |

v1.0.0 only uses the daily one (UTC days). Check the weekly ones before any weekly features rely on them.

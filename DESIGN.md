# Design

How MikuTracker works **now**, part by part, with the decisions behind it. Updated in place whenever behavior changes; it never describes old behavior. What's next is in `PLAN.md`; what each version changed is in `CHANGELOG.md`.

## The app (as of v1.1.0)

A website that only this Mac can open. Its feature tabs run down the left edge of the screen (along the bottom on a narrow window):
- **Top:** Home, then four TBD tabs (placeholders for features still to be decided).
- **Bottom:** the EXP table and Themes.

Each tab has its own address (`/`, `/tbd/1`–`/tbd/4`, `/exp-table`, `/themes`). An unknown address goes to Home. Pages are made of separate sections with small corners, so the theme's background shows between them.

## Home: characters

- **World switcher:** Kronos and Hyperion. The choice is saved, like the theme. Each world has its own characters and remembers which one is selected.
- **Character tabs:** each shows the avatar, name, level and job.
  - Click a tab to select it.
  - **Drag left or right** to reorder: the tabs move as you drag, and the order is saved when you let go. **Alt + ←/→** does the same from the keyboard, without triggering the browser's own Back/Forward.
  - A move shows at once, before the server confirms it. The server's order takes over as soon as it changes.
- **The + at the end** opens a box directly below it (left edges lined up), drawn above the sections under it. Near the right edge it slides left just enough to stay inside its section; it measures again when a result makes it wider.
  - Type a name and Search. The result is a preview the way Home will show it (layout C in `docs/add-character-mockup.html`):
    - its **avatar at 2× (192 px, sharp pixels)**, downloaded by the server during the search and sent along as image data, so the page still never contacts Nexon
    - name, job and world, and the level
    - the EXP bar and its text
    - world rank and overall rank, Legion and raid power

    Then **Add <name>**.
  - **Adding right after searching is instant:** the server uses its own search result instead of asking Nexon again.
  - Names are checked first (1–12 letters and numbers).
  - Nexon's answer is shown as is ("SakuraRin is on Hyperion, not Kronos.").
  - A character already on this world shows as **Added**.
  - The box has a solid background. On a narrow window the avatar goes above the details.
  - Escape, a click outside, or + again closes the box, and closing forgets what was in it.
- **The selected character:** avatar, name, job and world, level, the EXP bar ("86.92% to level 286 · 86.5T / 99.5T EXP"; "Level 300: the highest level." at 300), then four tiles: **world rank** ("Kronos rank"), **overall rank** (all NA worlds), and the world's **Legion level** and **raid power** (see below). Below it, the EXP section and Time to level (next).
  - A character no longer found in the rankings says so ("Not found in Nexon's rankings since Oct 21 (renamed, or no longer ranked). Showing its last saved numbers.").
- **The EXP section** (for the selected character, from `/api/characters/:id/progress`):
  - **Four range boxes, 7, 14, 30 and 90 days** (today included), each with the daily average, the share of a level gained a day ("Gained +20.5% a day", from progress through levels, across level-ups), and the total EXP. "—" for a range without history. 14 days is chosen at first.
  - **Choosing a range:** the buttons at the top right of the chart, or clicking a box; both stay in step. The chart shows that many bars, the dashed line is that range's average, and Time to level uses it.
  - **"EXP per day | Level"** at the chart's top left swaps it between the daily EXP bars (the default) and the level line. The range, boxes, dates and countdown stay the same.
  - **The level line** (v1.1.0): the level on each checked day, with progress through the level (278 at 93% is 278.93), so it climbs smoothly between level-ups.
    - **Gold dots** (the theme's level-up color) mark level-ups; a level-up on a day that wasn't checked shows on the next checked day, whose tooltip says "reached 278 since the last check (Oct 19)". The latest day is a white dot. Up to 14 days, every checked day also gets a small dot; beyond that they'd crowd the line.
    - **The scale** is rounded out to quarter levels, with a line every quarter level when the range spans one level or less ("278 · 25%"), otherwise every level, or every few levels (at most 6 steps).
    - Each day has a tooltip (hover or keyboard): its level ("Lv. 278 · 93.00%"), level-ups, or "no data". Without history yet: "No level history yet".
  - **The daily EXP chart:** one bar per UTC day, ending with **today, whose bar grows with each check**. Each bar shows:
    - its amount above it ("5.60T", "0" for a checked day with no EXP), its day below ("Oct 7", and "Today"), and its exact EXP and day in a tooltip (hover, or focus with the keyboard)
    - a **hatched "no data" stub** for a day that wasn't checked; the bar after such days carries their EXP together, with "2 days" under its amount
    - at **30 bars**, smaller amounts (without "2 days") and every 3rd day dated; at **90**, amounts only in the tooltips and every 10th day dated. Dates count back from today, so today always has one.
  - **Around the bars:** a round-numbered scale (1, 2, 2.5 or 5 × a power of ten; none when nothing is above 0), the average line with its legend, and below, "New day in 20h 49m 05s · 00:00 UTC is 5:00 PM your time", counting down each second.
  - **When a check of Nexon finishes** (seen through the once-a-minute status), the characters and the chart are loaded again, so today's bar grows without reloading the page. **At 00:00 UTC** the chart is loaded again too, starting the new day's bar.
  - **With no history yet** (a character not checked since it was added), every day is "no data" and the chart says "No EXP history yet: the first bar appears after the next check of Nexon (every 4 hours)."
- **Time to level:** at the chosen range's average, the next level and the next multiple of 5 (207 → 210), each with the time ("≈ 2.4 days", "≈ 11.4 months") and "7.20T EXP to go · around Fri, Oct 23" (the date in local time).
  - "Not enough history yet" when the range has no history.
  - "Not at this pace" when it shows no EXP (an average of 0 or less).
  - "Level 300: nothing left to reach."
- **The last check of Nexon** shows at the top right: "Checked Nexon today at 08:03 UTC (1:03 AM your time)" (today and yesterday go by the UTC day), or "Last check (…) had a problem: …", or, before any check, that the always-on app checks every 4 hours. It's asked for again every minute.
- **Legion is shared by a world's characters.** Nexon lists Legion under one character per account per world (for an account, apparently its highest-level character there; RemyRabbit for one real account). Once that character is added, every character on the world shows its Legion, with "listed under RemyRabbit" on the others. Until then it's **N/A**, with a hint to add that character. With two listed characters on one world (two accounts), the most recently checked one is used. The search preview shows the character's own Legion entry, or else the world's.
- **Delete** asks first ("This also deletes all of its saved history").
- While loading, Home says "Loading…". An empty world says how to add a character. Failures are shown.

## The EXP table tab

The GMS EXP needed to go from each level to the next, for levels 1–299. It's reference only, not tied to any character.
- **Ranges:** 1–199, 200–299 (the default) and All.
- **Jump to a level:** type it and press Go. The row is marked and scrolled into view. If the level isn't in the range shown, the range switches to 1–199 or 200–299. Anything but a whole level from 1 to 299 says so and changes nothing else.
- **Each row shows:**
  - the level ("285 → 286")
  - the exact EXP
  - the short form (99.5T)
  - the change from the level before, as "+12.0%", shown in red at +100% or more (the jumps into 200 and 260)
  - the total from level 1 on reaching the next level

  Level 1 has no change ("—").
- **The header row** stays visible while scrolling.
- **It says which patch** the table is current as of (v.271, September 2026) and where the figures come from.

## Nexon's rankings data

GMS has no official API, so character data comes from the public JSON behind nexon.com's rankings page: undocumented, no key needed, and able to change without notice (`server/src/nexon/`).

**What it's like** (found by asking it, 2026-10-21):
- A name matches the whole name exactly, ignoring capitals. "batter" finds a character called Batter, not batterboi. An unknown name gives 0 results, not an error.
- A world lookup only finds that world's characters.
- `reboot_index` picks the world group: 0 = all NA worlds, 1 = Heroic only.
- The Legion board lists one character per account.

**Looking a character up on a world takes 3 requests:**
1. **The world board:** level, EXP into the level, job, avatar and world rank.
2. **The overall board:** overall rank, among all NA worlds (`reboot_index=0`).
3. **The Legion board:** Legion level and raid power, or "not listed" when the character isn't the account's Legion character.

The result: `{ name, worldId, level, exp, job, avatarUrl, worldRank, overallRank | null, legion | null }`, with the name as Nexon spells it.

**Checks and errors.** Every reply is checked with zod: a level from 1 to 300, whole EXP that's exact as a number, positive ranks, and an avatar only on Nexon's own https servers. Each problem is reported with a message that can be shown as is:

| Problem | Kind | API status |
| --- | --- | --- |
| Not on this world, but ranked elsewhere: "SakuraRin is on Hyperion, not Kronos." | `other-world` | 409 |
| Not in the rankings at all (a typo, or too low to be ranked) | `not-found` | 404 |
| No answer, a timeout (15 s), or Nexon busy (429 or 5xx), after 2 retries waiting 2 s, then 6 s | `unreachable` | 503 |
| Any other status, or a reply of an unexpected shape: not retried | `changed` | 502 |
| The EXP doesn't fit the EXP table, probably after a GMS patch | `exp-table` | 502 |

**Politeness:** requests go one at a time, at least 1.5 seconds apart, even when two lookups happen at once. A failed request doesn't hold up the next.

**Tests never reach Nexon:**
- The client gets `fetch`, the clock and the pause passed in. Tests use a fake Nexon (`server/test/fixtures/nexon.ts`) with made-up characters, answering the way the real one was seen to.
- Any real network request in a server test fails loudly (`server/test/setup.ts`).
- `npm run nexon:check -- <name> [45|70]` looks one character up in the real rankings, as a check by hand that their data still has the expected shape.

## The refresh (every 4 hours)

`server/src/services/refresh.ts`. Every character is looked up in Nexon's rankings again **every 4 hours**. Nobody knows when Nexon updates its rankings (a watch saw no change for hours), so checking a few times a day catches it whenever it happens.
- **When:** due when the last run *started* at least 4 hours ago, or there's been none. Checked when the server starts, then every 15 minutes, so a sleeping or switched-off Mac catches up when it's back. Runs never overlap. The timer doesn't keep the server alive, and a failed check is reported, never fatal.
- **Only where `MIKU_REFRESH` is on:** off in the dev copy and in tests; the always-on app does it. `npm run refresh` runs one by hand (e.g. `MIKU_DATABASE=dev npm run refresh`).
- **Each character, in world then tab order,** through the polite Nexon queue:
  - its details are updated (Nexon's current spelling of the name, job, level, EXP, ranks, Legion; `checkedAt`)
  - today's snapshot is created or **updated in place**, adding the EXP gained since the check before to the day's `gained` (the first check of a day counts from the last check before it, days that weren't checked included)
  - the avatar is downloaded only if Nexon's address for its look changed; if that download fails, it's tried again next time
- **Not found** (renamed, dropped out of the rankings, or now on the other world): marked missing since that run, keeping its history and last numbers. Found again later, the mark goes.
- **Nexon unreachable, or answering in an unexpected shape:** that would hit everyone, so the run stops at once and records why. Nobody is marked missing. One character's EXP not fitting the table fails just that character; the rest carry on.
- **Every run is recorded** (`RefreshRun`): start, end, how many were checked, updated, missing and failed, and the problem if any. `GET /api/refresh` gives the latest.

## Game figures and EXP math

- **`server/src/gameFigures/`:** the GMS EXP table, and the worlds (Kronos 45, Hyperion 70, the IDs Nexon's rankings use). The worlds now live in `shared/` so the app can show their names. Each is written down with its source and patch. The EXP table is current as of **v.271**, which cut levels 210–259 by about 8% (210–214) up to 58% (250–259).
  - Its source is whackybeanz.com's MapleSEA / KMS / TMS table. The site's "GMS" option is out of date.
  - A test checks that every level in 210–259 is the old GMS value with exactly the announced cut, and that every other level is unchanged.
  - Re-check it after each GMS patch.
- **`server/src/calc/`:** pure calculations, with no database and no HTTP.
  - **`exp.ts`:** a character's progress is (level, EXP into the level), as the rankings report it. **Total EXP** is everything since level 1, so EXP gained across a level-up is just the difference of two totals. The most possible is 8,509,498,537,428,819, still exact as a JavaScript number. Impossible progress is refused: a level outside 1–300, EXP that isn't a whole number from 0 to one short of the next level, or any EXP at level 300.
  - **`utcDays.ts`:** MapleStory's days are UTC days (the daily reset is at 00:00 UTC), written "YYYY-MM-DD", whatever the computer's time zone.
  - **`dailyGains.ts`:** EXP per UTC day from the snapshots' `gained` (each check adds the change in total EXP since the check before, so level-ups need nothing special). Today is a bar too. A day without a snapshot is "no data"; the next day that has one carries their EXP, with how many days it `covers` (a character's first day covers 1).
    - **Ranges (7, 14, 30, 90 days, today included):** the EXP from the total at the end of the day before the range (from the last snapshot on or before it, even if days just before weren't checked) to the latest snapshot. For a character first tracked within the range, from where its first day started (its total minus that day's `gained`).
    - **Daily average:** that EXP divided by the days from that starting point to today, today counting as a day. So a character tracked for 3 days isn't averaged over 14, and days not checked are still counted.
    - **Levels a day:** the same, as levels with progress through them (285 at 86.91% is 285.8691), so "+20.5% a day" works across level-ups. Level 300 is just 300 (until v1.1.0 it counted as 301, crediting an extra level to a range that reached 300).
    - **Daily levels** (`levelPoints`): each checked day's level with progress, the whole levels reached since the check before (from where a character's first day started, for its first), and how many days that covers.
    - With no snapshot in the range, there's nothing to say (`null`).
  - **`levelGoals.ts`:** the next level and the next multiple of 5 (207 → 210, 285 → 290; at most 300), each with the EXP still needed and the days at a daily rate. There's one goal when they're the same level (209 → 210), none at 300, and the days are "unknown" (`null`) at 0 EXP a day.
- **`client/src/lib/format.ts`:** how the app shows things.
  - EXP to 3 significant digits (5.12B, 137B, 20.7T); a value that rounds up to 1,000 moves to the next unit (999.6B → 1.00T).
  - Thousands separators.
  - Changes as "+12.0%".
  - Durations in the unit that reads best ("≈ 6 hours", "≈ 4.3 days", "≈ 5.7 months", "≈ 2.0 years").
  - Future dates in local time ("Sun, Oct 25", with the year when it isn't this year).

## Themes

Two themes, **Ren** (the default) and **Pochacco**. The choice is saved on the server, so it holds across browsers and restarts.
- **The Themes tab** shows a card per theme. Each card previews its own theme (colors, a little chart, the EXP bar and the description), whichever theme is in use. Clicking a card saves and applies it.
  - While saving, the cards can't be clicked again.
  - A failed save says so and keeps the current theme.
- **Colors, fonts and corner sizes** come only from the theme's CSS variables (`client/src/styles/themes.css`). Components never use colors directly.
- **Theme art** (background pictures) lives in the data folder's `theme-art/` as `<theme>.png`, `.jpg` or `.webp`, and **never in git**, because it's someone else's art (Sanrio's Pochacco, Nexon's Ren).
  - The server lists what's there at `/api/theme-art`, with the file's change time in each address so a replaced picture isn't served from cache, and serves the files at `/theme-art/…`.
  - Each theme's art gets its own variable (`--art-ren`, `--art-pochacco`), whichever theme is in use, so each card previews its own art.
- **Without art**, each theme draws its own background:
  - **Ren:** a moonlit violet sky, with an ink blossom tree, a full moon and red petals drifting down, drawn on a canvas (`client/src/looks/RenSky.tsx`). It holds still when the system asks for reduced motion. It reads its colors from its own canvas, which is marked `data-theme="ren"`, so they're always Ren's, whatever the page's theme is at that moment. (In v1.0.0, read from the page right after switching from Pochacco, they were blank and everything was drawn black. As a second layer, the page is also switched to a theme in a layout effect, before anything on it starts.)
  - **Pochacco:** light-blue gingham.
- **Fonts** come from Google Fonts: Inter, Shippori Mincho, Nunito and Fredoka. They're the only outside requests the page makes so far.

## Settings and the API

- **`/api/settings`:** GET returns `{ theme, worldId }`, creating the defaults (Ren, Kronos 45) on first read. PUT saves `{ theme }`, `{ worldId }` or both. An empty save, an unknown theme or world, or extra fields are refused with a 400.
- **`/api/health`:** answers `{ ok: true }`. It's used to check the always-on app later.
- **`/api/exp-table`:** `{ patch, date, rows: [{ level, expToNext, total }] }` for levels 1–299, with every number exact.
- **`/api/characters/:id/progress`:** `{ today, bars: [{ day, gained, covers }] (90, ending today), levels: [{ day, level, reached, covers }] (the checked days among them), ranges: [{ days, stats: { total, average, levelPerDay } | null, goals }] (7, 14, 30, 90) }`, each range's goals at its own average (none at 300; a negative average counts as 0). A character not checked since it was added has no history yet. 404 for an unknown character or another owner's.
- **`/api/characters?world=45`:** `{ characters, selectedId }`: the world's characters in tab order, each `{ id, worldId, name, job, level, exp, expToNext, worldRank, overallRank, legion, avatar, addedAt, checkedAt }`. With nothing selected (the selected one was deleted), the first counts as selected.
- **`POST /api/characters`** `{ world, name }`:
  - **Uses the owner's latest search** when it was this character on this world and is at most an hour old: instant, and still the server's own data. Otherwise it **looks the character up in Nexon itself** (nothing from the page is trusted). Adds it at the end of the tabs with its first snapshot, selects it, stores its avatar (the search's picture, or a fresh download), and answers 201. The answer, like the list, carries the world's Legion.
  - **A character already added** is refused with "MikuBeam is already added on Kronos." before Nexon is asked, named as it's spelled. Two adds at the same moment are caught by the database's uniqueness check, with the same message.
  - **Nexon's problems** come back as with `/api/search`.
  - **A failed avatar download** doesn't stop the add; the character just has no picture yet.
- **`PUT /api/characters/order`** `{ world, ids }`: every one of the world's characters exactly once, or 400.
- **`POST /api/characters/:id/select`** and **`DELETE /api/characters/:id`:** 204, or 404 for an unknown character or another owner's. Deleting removes the snapshots, avatars and selection too.
- **`/api/search?world=45&name=MikuBeam`:** looks a character up in Nexon's rankings (see below) and downloads its avatar.
  - The answer: `{ name, worldId, level, exp, expToNext, job, worldRank, overallRank, legion, avatar }`, where `avatar` is the picture as image data (`data:image/png;base64,…`, or null if it couldn't be downloaded). Nexon's image address is never sent to the page.
  - **The server remembers each owner's latest search** (a new one replaces it; adding uses it up), so adding it right after needs no new Nexon requests.
  - The name must be 1–12 letters and numbers (spaces around it are ignored), and the world 45 or 70. Anything else is a 400, without asking Nexon. Nexon's problems come back with `{ error, kind }`.
- **Errors** always come back as JSON:
  - invalid input → 400, listing each problem by its path
  - malformed JSON → 400
  - a body over 100 KB → 413
  - a duplicate → 409
  - a missing record → 404
  - anything unexpected → a plain 500, logged on the server with no details sent
- **Big numbers:** EXP and raid power are `BigInt` in the database and are sent as plain JSON numbers, which are exact up to 9,007,199,254,740,991. The most EXP a character can have, 8,509,498,537,428,819, fits. Anything bigger is refused rather than rounded.
- **Whose data:** every API request passes the login check (`server/src/middleware/auth.ts`). With no login yet, it marks the request as the sole owner's. Code reads the owner only through `currentOwner()` (`server/src/owner.ts`), so adding login later changes only those two files. Top-level tables carry an `ownerId`.

## Settings for the server

Every setting is in `server/src/config.ts`, read from environment variables (or `server/.env`; see `.env.example`), with defaults for this Mac:

| Setting | Variable | Default |
| --- | --- | --- |
| Data folder | `MIKU_DATA_DIR` | `~/Library/Application Support/MikuTracker` |
| Which database | `MIKU_DATABASE` | `real` (`miku.db`); `dev` picks `dev.db` |
| Database (overrides both) | `DATABASE_URL` | `file:<data folder>/miku.db` |
| Backups / theme art / avatars | `BACKUP_DIR`, `THEME_ART_DIR`, `AVATAR_DIR` | `<data folder>/backups`, `/theme-art`, `/avatars` |
| Address and port | `HOST`, `PORT` | `127.0.0.1`, `4750` |
| Backups, daily refresh | `MIKU_BACKUPS`, `MIKU_REFRESH` | `on` (`off` for the dev copy) |
| Nexon's rankings data | `NEXON_RANKINGS_URL` | `https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na` |
| A stand-in for Nexon's image servers (the QA copy's fake Nexon); only an address on this Mac is accepted | `NEXON_IMAGES_URL` | none (avatars come from Nexon) |

The config refuses to load when:
- **`HOST` isn't this machine.** There's no login yet. The one exception is `HOST=0.0.0.0` with `MIKU_IN_CONTAINER=1`, for Docker, where the container's port must be published to `127.0.0.1` only.
- **`PORT` isn't 1–65535.**
- **An on/off setting is anything else.**
- **The database isn't SQLite** (`file:`).
- **A test run has no throwaway database, or its database or any of its folders is inside the real data folder.** Checked against both the given home folder and the account's own.

Settings are read on first use, not on import, and the database connection opens on first use (`db()`), so a problem shows up where it's used. The database's folder is created if it's missing, as on a new Mac or in a new container.

Moving to a server or Docker means setting these variables, not changing code. Game math will use UTC on purpose, so the server's time zone won't matter.

## Running it

| Command | What it does |
| --- | --- |
| `npm run dev` | The development copy: API on 4751 with `dev.db` (migrated first, no backups or refresh), and the page on http://127.0.0.1:4752 with live reload. The page forwards `/api` and `/theme-art` to 4751. |
| `npm run app:install` / `app:restart` / `app:status` / `app:uninstall` | The always-on app (below). |
| `npm run backup` | Backs up the real database now (`MIKU_DATABASE=dev npm run backup` for the dev copy's, into `dev-backups/`). |
| `npm run db:migrate -- --name <what>` | After changing `server/prisma/schema.prisma`: creates a migration, applies it to `dev.db`, and regenerates the database code. When Prisma wants to ask a question (e.g. before adding a uniqueness rule), write the migration with `prisma migrate diff` instead and apply it with `prisma migrate deploy` (see v0.7.0's `refresh` migration). |
| `npm run refresh` | One refresh of every character now (`MIKU_DATABASE=dev npm run refresh` for the dev copy). |

## The always-on app

`server/scripts/app.ts` and `server/src/launchAgent.ts`, adapted from Goal Tracker.
- **A macOS launch agent** (`~/Library/LaunchAgents/com.mikutracker.app.plist`) starts the server when you log in and again if it stops (at most every 10 seconds). A sleeping Mac just pauses it.
- It serves **http://127.0.0.1:4750**, only on this Mac, with the real database and **backups and the 4-hourly Nexon refresh on**. Its output goes to `~/Library/Logs/MikuTracker/app.log`.
- **It runs from its own copy of `main`** (the latest finished version) in the data folder's `app/`, so work in progress never reaches it.
- **Commands:**
  - `app:install` once, and `app:restart` after each finished version. Both first make a fresh copy of `main` next to the running one and build it (libraries cloned from the running copy, or installed when they changed), with the running app untouched. Only then do they stop the app, back up the database (`…-before-update.db`), update it (`prisma migrate deploy`), swap the copy in, start it, and wait until it answers. If the build fails, the old app never stopped; if the backup or update fails, the old app is started again.
  - **Before touching anything real, both rehearse the new copy** on a copy of the real database in a temporary folder, on port 4756 with backups and the refresh off. They update the copy's database, start the new version, and load the page, each world's characters and every character's EXP history, checking it's still their own server answering. If anything fails, they stop there (showing the new version's own output), delete the new copy, and the running app and your data are unchanged. A taken port 4756 stops the rehearsal before it starts (something else there could answer in place of a broken version), and Ctrl+C removes everything it made. `app:rehearse` does only this.
  - `app:status`: is it set up, and does it answer?
  - `app:uninstall`: stops it and removes the launch agent and the copy. Data and backups stay.
  - They refuse to run against anything but the real database.
- No "back up now" button and no "start over empty" command (decided 2026-10-23: not needed).

## Backups

`server/src/backups.ts`, adapted from Goal Tracker.
- **A copy of the database** made with SQLite's own backup (safe while the app runs), written under a temporary name first so a copy cut short never looks finished, into the data folder's `backups/`: one per UTC day, `miku-2026-10-23.db`.
- **When:** as the server starts if there's no regular one from today (UTC; a before-update copy doesn't count, since it was taken before the day's changes), then checked every hour (the Mac isn't always on, so nothing waits for a clock time); before every `app:install` / `app:restart` (`miku-…-before-update.db`); and by hand with `npm run backup` (replacing today's copy).
- **Kept:** the newest 30, plus the first of each UTC month for the last 12 months (this month included), so at most about 42. Older ones are removed after each backup; other files in the folder are left alone.
- **Only where `MIKU_BACKUPS` is on:** the always-on app. Off for the dev copy and tests.
- They're on the same drive as the database: they protect against mistakes and bugs. Time Machine to an external drive covers a lost or broken Mac.

## Database

SQLite through Prisma 7 (`server/prisma/schema.prisma`), in the data folder, never in the repo:
- **`miku.db`:** real data, used only by the always-on app.
- **`dev.db`:** development, with its own `dev-backups/` and `dev-avatars/` folders (chosen by the database file's name, however it was picked), so clearing out unused avatars or old backups in one never touches the other's files. (Until v0.10.0 both shared `avatars/`; the dev copy's two files were moved.)

Tables:
- **`Settings`:** one row per owner: theme and world.
- **`Character`:** owner, world, name (as Nexon spells it, plus a lowercase copy for spotting duplicates), job, the latest level, EXP, ranks and Legion, its tab position, added and last-checked times, when it went missing from the rankings (if it has), and Nexon's address for its current look. Unique per owner, world and name. **Tab positions in each world are always exactly 0, 1, 2, …**: adding goes at the end, deleting closes the gap, and reordering renumbers.
- **`Snapshot`:** **one per character per UTC day**: the day's latest level, EXP, total EXP, ranks and Legion, with when they were last checked, and **`gained`**, the EXP gained that day (each check adds the change since the check before; 0 for a character's first, when it's added). The `daily_gained` migration filled it in for days saved before v0.9.0 from the day before's total (0 for each character's first day). Unique per character and day; each refresh that day updates it in place. A day whose numbers didn't change still has one (0 EXP gained), so a missing day means "not checked" (the Mac was off). The first is saved when a character is added. Kept forever.
- **`RefreshRun`:** each refresh: start and end, checked, updated, missing and failed counts, and the problem if any.
- **`Avatar`:** every avatar file a character has had, with when it was first and last seen. The current one is the most recently seen, so an old look that returns is current again. Kept for the avatar history planned after v1.0.0.
- **`Selection`:** the selected character on each world.

Deleting a character deletes its snapshots, avatars and selection.

**Avatar files** are in the data folder's `avatars/` (`dev-avatars/` for the dev copy):
- Downloaded only from Nexon's https image servers, up to 1 MB, and only if the first bytes really are a PNG, GIF or JPEG.
- Named after their contents (`<hash>.png`), so the same picture is stored once and a new look is a new file. Written under a temporary name first.
- Served at `/avatars/…` with long caching, since a file never changes.
- After a delete, files no character uses any more are removed, along with any leftover partly written ones.

## Tests

- **`npm test`** runs the server's tests, then the app's, each in California time and again in UTC. **`npm run typecheck`** checks all three packages.
- **The server's tests** use a throwaway database in the temporary folder. It's built from the same migrations before the run and deleted after, and tables are cleared between tests. A test fails if the schema changed without a migration.
  - API tests get a fresh app and server per request, bound to `127.0.0.1`, never serving a built page.
  - The clock is fixed at Tue 20 Oct 2026, 19:00 UTC, with only `Date` faked.
- **The app's tests** run in a simulated browser against a fake server (`client/test/server.tsx`).
- **No test reaches the network.**
- **No test can reach the real data folder,** even with the code broken on purpose:
  - Test runs get a fake home folder (`HOME`, set in `server/vitest.config.ts`, which mutation testing never changes). The config reads the home folder from `HOME` when it's set, so this also works in worker threads, where `os.homedir()` would read the real one.
  - The config refuses any test folder inside the real data folder.
  - Tests that create or delete folders use paths from the test setup, not from the code under test.

  (In v0.5.0 a mutation run broke the config in a way the old guard didn't cover, and a test's clean-up deleted the real `theme-art/` folder. See the CHANGELOG.)
- **Mutation testing** (Stryker, `/mutation-audit`): `npm run test:mutate` (server and shared) and `npm run test:mutate:client` (the app's `lib/` and `api/`). Both run incrementally, with 2 workers each. `npm run test:mutate:full` reruns everything before each version.
  - Every mutant must be caught, or be marked with a written reason that it provably can't change behavior.
  - The page's components and pages aren't mutation-tested (from v0.10.0): they get normal tests, screenshots, and a click-through on the QA copy before each version. Class names and styles are skipped anyway (`scripts/stryker-ignore-looks.mjs`), as is the canvas drawing in `client/src/looks/`.
- **The QA copy** (`npm run qa`, `scripts/qa.mjs`): testing by hand or in a browser happens only there. It copies the data (the real database once it exists, otherwise `dev.db`, with avatars and theme art) into a temporary folder, builds the page (once, as it starts), and serves the production build on http://127.0.0.1:4753 (as the always-on app does; testing happens there) and the development build on http://127.0.0.1:4754, with backups and refresh off. It deletes the folder when stopped. `--empty` starts with no data; `--fake-nexon` answers searches and refreshes from the fake Nexon instead of the real one. Each part runs in its own process group, so stopping (Ctrl+C, or any part ending on its own, which exits with status 1) frees both ports; a failed copy leaves no folder behind.
- **The fake Nexon** (`server/scripts/fakeNexon.ts`, port 4755): made-up characters (the tests' three, a level-300 one, and one without Legion), answering rankings the way the real Nexon does (from `server/test/fixtures/nexon.ts`) and serving their avatars as real little pictures. `POST /control/set`, `/remove` and `/reset` change them, to make a character level up or vanish.
- **The click-through** (`npm run qa:check`, `scripts/qa-check.mjs`): an empty QA copy with the fake Nexon, driven in Chrome (`playwright-core`) on the production build. It goes through every page and button and the edge cases (name rules, not found, the other world, numbers that don't fit the EXP table, level 300, shared Legion, reordering at both ends, delete and cancel, the EXP table's jumps, both themes and the Ren sky after switching), writes a known 90-day history and checks the ranges against hand-worked numbers, runs a real refresh with a level-up and a lost character, fakes eight kinds of failure, sends bad requests, and checks a narrow window and that the page logged no errors. Nothing in it depends on your data. Exit status 1 if anything failed.
- **GitHub** runs the typecheck, the tests and the production build when a version branch is pushed (`.github/workflows/tests.yml`).

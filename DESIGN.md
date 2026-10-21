# Design

How MikuTracker works **now**, part by part, with the decisions behind it. Updated in place whenever behavior changes; it never describes old behavior. What's next is in `PLAN.md`; what each version changed is in `CHANGELOG.md`.

## The app (as of v0.3.0)

A website that only this Mac can open. Its feature tabs run down the left edge of the screen (along the bottom on a narrow window):
- **Top:** Home, then four TBD tabs (placeholders for features still to be decided).
- **Bottom:** the EXP table and Themes.

Each tab has its own address (`/`, `/tbd/1`–`/tbd/4`, `/exp-table`, `/themes`). An unknown address goes to Home. Pages are made of separate sections with small corners, so the theme's background shows between them.

Home is a placeholder until v0.5.0.

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

## Game figures and EXP math

- **`server/src/gameFigures/`:** the worlds (Kronos 45, Hyperion 70, the IDs Nexon's rankings use) and the GMS EXP table. Each is written down with its source and patch. The EXP table is current as of **v.271**, which cut levels 210–259 by about 8% (210–214) up to 58% (250–259).
  - Its source is whackybeanz.com's MapleSEA / KMS / TMS table. The site's "GMS" option is out of date.
  - A test checks that every level in 210–259 is the old GMS value with exactly the announced cut, and that every other level is unchanged.
  - Re-check it after each GMS patch.
- **`server/src/calc/`:** pure calculations, with no database and no HTTP.
  - **`exp.ts`:** a character's progress is (level, EXP into the level), as the rankings report it. **Total EXP** is everything since level 1, so EXP gained across a level-up is just the difference of two totals. The most possible is 8,509,498,537,428,819, still exact as a JavaScript number. Impossible progress is refused: a level outside 1–300, EXP that isn't a whole number from 0 to one short of the next level, or any EXP at level 300.
  - **`utcDays.ts`:** MapleStory's days are UTC days (the daily reset is at 00:00 UTC), written "YYYY-MM-DD", whatever the computer's time zone.
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
  - **Ren:** a moonlit violet sky, with an ink blossom tree, a full moon and red petals drifting down, drawn on a canvas (`client/src/looks/RenSky.tsx`). It holds still when the system asks for reduced motion.
  - **Pochacco:** light-blue gingham.
- **Fonts** come from Google Fonts: Inter, Shippori Mincho, Nunito and Fredoka. They're the only outside requests the page makes so far.

## Settings and the API

- **`/api/settings`:** GET returns `{ theme, worldId }`, creating the defaults (Ren, Kronos 45) on first read. PUT `{ theme }` saves the theme. Anything else (an unknown theme, extra fields) is refused with a 400.
- **`/api/health`:** answers `{ ok: true }`. It's used to check the always-on app later.
- **`/api/exp-table`:** `{ patch, date, rows: [{ level, expToNext, total }] }` for levels 1–299, with every number exact.
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
| Backups / theme art | `BACKUP_DIR`, `THEME_ART_DIR` | `<data folder>/backups`, `/theme-art` |
| Address and port | `HOST`, `PORT` | `127.0.0.1`, `4750` |
| Backups, daily refresh | `MIKU_BACKUPS`, `MIKU_REFRESH` | `on` (`off` for the dev copy) |

The config refuses to load when:
- **`HOST` isn't this machine.** There's no login yet. The one exception is `HOST=0.0.0.0` with `MIKU_IN_CONTAINER=1`, for Docker, where the container's port must be published to `127.0.0.1` only.
- **`PORT` isn't 1–65535.**
- **An on/off setting is anything else.**
- **The database isn't SQLite** (`file:`).
- **A test run has no throwaway database, or its database is inside the real data folder.**

Settings are read on first use, not on import, and the database connection opens on first use (`db()`), so a problem shows up where it's used. The database's folder is created if it's missing, as on a new Mac or in a new container.

Moving to a server or Docker means setting these variables, not changing code. Game math will use UTC on purpose, so the server's time zone won't matter.

## Running it

| Command | What it does |
| --- | --- |
| `npm run dev` | The development copy: API on 4751 with `dev.db` (migrated first, no backups or refresh), and the page on http://127.0.0.1:4752 with live reload. The page forwards `/api` and `/theme-art` to 4751. |
| `npm start` | Builds the page, brings the real database up to date (`prisma migrate deploy`), and serves everything from http://localhost:4750. From v0.8.0 the always-on app does this, with a backup first. |
| `npm run db:migrate` | After changing `server/prisma/schema.prisma`: creates a migration and applies it to `dev.db`. |

## Database

SQLite through Prisma 7 (`server/prisma/schema.prisma`), in the data folder, never in the repo:
- **`miku.db`:** real data, used only by the always-on app.
- **`dev.db`:** development.

Tables so far: `Settings` (one row per owner: theme and world).

## Tests

- **`npm test`** runs the server's tests, then the app's, each in California time and again in UTC. **`npm run typecheck`** checks all three packages.
- **The server's tests** use a throwaway database in the temporary folder. It's built from the same migrations before the run and deleted after, and tables are cleared between tests. A test fails if the schema changed without a migration.
  - API tests get a fresh app and server per request, bound to `127.0.0.1`, never serving a built page.
  - The clock is fixed at Tue 20 Oct 2026, 19:00 UTC, with only `Date` faked.
- **The app's tests** run in a simulated browser against a fake server (`client/test/server.tsx`).
- **No test reaches the network.**
- **Mutation testing** (Stryker, `/mutation-audit`): `npm run test:mutate` (server and shared) and `npm run test:mutate:client` (the app). Both run incrementally, with 2 workers each. `npm run test:mutate:full` reruns everything before each version.
  - Every mutant must be caught, or be marked with a written reason that it provably can't change behavior.
  - The app's class names and styles are skipped (`scripts/stryker-ignore-looks.mjs`), as is the canvas drawing in `client/src/looks/`. Looks are checked on screenshots.
- **GitHub** runs the typecheck and tests when a version branch is pushed (`.github/workflows/tests.yml`).

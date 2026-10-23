# MikuTracker

A personal website for tracking MapleStory (GMS) progress on Kronos and Hyperion. It runs on one Mac, and it's built so it can move to a server later by changing settings, not code. Character data comes from Nexon's public rankings, never from the game.

**Status:** v1.0.0 (first real use). See `CHANGELOG.md` for what each version changed and `PLAN.md` for what comes next.

## What it does

- **Home:** your characters on Kronos and Hyperion as tabs (search and add with **+**, drag or Alt+←/→ to reorder, delete). For the selected one:
  - level and the EXP bar, world and overall rank, and the world's Legion level and raid power
  - EXP over the last **7, 14, 30 or 90 days**: the daily average, the share of a level gained a day, and the total
  - a chart of EXP per UTC day; today's bar grows with each check of Nexon
  - the countdown to the daily reset (00:00 UTC) in your time
  - time to the next level and the next multiple of 5, at the chosen range's average
- **EXP table:** the GMS EXP needed for every level, current as of patch v.271.
- **Themes:** Ren (the default, with falling blossoms) and Pochacco.

**Where the numbers come from:** every 4 hours (while the Mac is on) the app looks each character up in Nexon's rankings and saves the day's numbers. EXP is "now minus the last check", so a character's history starts when you add it, and days the Mac was off show as "no data" (their EXP lands on the next checked day). Nexon updates its rankings on its own schedule, so they can trail the game a little.

## Using it

**The app is at http://127.0.0.1:4750.** It starts by itself when you log in to the Mac, and keeps running in the background. A sleeping Mac just pauses it.

| Command | When |
| --- | --- |
| `npm run app:status` | Is it running? |
| `npm run app:restart` | After each new version: builds it, then stops the app, backs up, updates the database, and starts it again. If anything fails, the old version keeps running. |
| `npm run backup` | Back up by hand (it also backs up by itself every day). |
| `npm run app:install` | Only once, to set it up (already done). |
| `npm run app:uninstall` | Stops it and removes it from the login items. Your data and backups stay. |

Its log is `~/Library/Logs/MikuTracker/app.log`.

**Backups:** one a day in `~/Library/Application Support/MikuTracker/backups/` (`miku-2026-10-23.db`), plus one before each update. The newest 30 are kept, plus the first of each month for a year. They're on the same drive as the data, so they protect against mistakes and bugs; Time Machine to an external drive covers a lost Mac.

**To restore a backup:** stop the app (`npm run app:uninstall`), copy the backup over `~/Library/Application Support/MikuTracker/miku.db`, delete any `miku.db-journal`, `miku.db-wal` or `miku.db-shm` next to it (SQLite's leftovers from the old file, which could undo the restore), then `npm run app:install`.

**Theme pictures** go in `~/Library/Application Support/MikuTracker/theme-art/` as `pochacco.png` or `ren.png` (also `.jpg` or `.webp`). They're never committed.

## Working on it

Needs Node 22 or newer (`.nvmrc` says 24).

```
npm install
npm run dev     # the development copy: http://127.0.0.1:4752 (its own dev.db; never checks Nexon by itself)
npm run qa      # a throwaway copy for testing by hand: http://127.0.0.1:4753 (deleted when stopped)
npm test        # every test, in California time and UTC
```

- **`CLAUDE.md`**: how we work: versioning, the testing rules, and every command
- **`DESIGN.md`**: how the app works now, part by part, with the decisions behind it
- **`PLAN.md`**: what's planned next, version by version
- **`CHANGELOG.md`**: what each version changed
- **`docs/theme-examples/`**: the approved mockup

**Stack:** `server/` (Express 5 + Prisma 7 with SQLite), `shared/` (zod input rules for both sides), `client/` (React 19 + Vite + Tailwind 4).

## Ports and data

| What | Address |
| --- | --- |
| The always-on app | http://127.0.0.1:4750 |
| Development API / page | 4751 / http://127.0.0.1:4752 |
| QA copy: production / development page | http://127.0.0.1:4753 / http://127.0.0.1:4754 |

Everything is kept outside the repo, in `~/Library/Application Support/MikuTracker/`:
- `miku.db`: your real data; `backups/` and `avatars/` belong to it
- `dev.db`: development, with its own `dev-backups/` and `dev-avatars/`
- `app/`: the always-on app's copy of the latest version
- `theme-art/`: theme pictures

The app only answers on this Mac (`127.0.0.1`), and will until a login exists.

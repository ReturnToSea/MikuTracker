# MikuTracker

A personal website for tracking MapleStory (GMS) progress. It runs on one Mac, and it's built so it can move to a server later by changing settings, not code.

**Status:** v0.10.0: add your Kronos and Hyperion characters on Home (search with a full preview, add instantly, reorder, select, delete; Legion shared across a world); the always-on app refreshes their level, EXP, ranks and Legion from Nexon's rankings every 4 hours and backs up the database daily. For the selected character: the daily average, share of a level a day and total EXP over the last 7, 14, 30 and 90 days, a chart of EXP per UTC day for any of those ranges (today's bar grows with each check), a countdown to the next 00:00 UTC, and the time to the next level and next multiple of 5 at the chosen range's average. Also the GMS EXP table tab and the Ren and Pochacco themes. See `PLAN.md` for the plan to v1.0.0.

## Docs

- **`DESIGN.md`**: how the app works now
- **`PLAN.md`**: what v1.0.0 includes, the versions and steps to get there, decisions, and research
- **`CLAUDE.md`**: how we work (versioning, testing rules)
- **`docs/theme-examples/`**: the approved mockup
- **`CHANGELOG.md`**: what each version changed

## Running it

Needs Node 22 or newer (`.nvmrc` says 24).

```
npm install
npm run dev           # development copy: http://127.0.0.1:4752 (uses dev.db)
npm run app:install   # the always-on app: http://localhost:4750 (uses the real database), started at every login
npm run app:restart   # after each new version (backs up first)
npm test              # every test, in California time and UTC
```

The always-on app backs up the database every day (the newest 30 plus one a month for a year, in `backups/`) and checks Nexon every 4 hours. `npm run app:status` says whether it's running, `npm run backup` backs up by hand, and `npm run app:uninstall` removes it (your data and backups stay).

Theme pictures go in `~/Library/Application Support/MikuTracker/theme-art/` as `pochacco.png` or `ren.png` (also `.jpg` or `.webp`). They're never committed.

## Stack

- `server/`: Express 5 + Prisma 7 (SQLite) API
- `shared/`: zod input rules used by both the server and the app
- `client/`: React 19 + Vite + Tailwind 4 app

## Ports and data

| What | Address |
| --- | --- |
| The always-on app | http://127.0.0.1:4750 |
| Dev API server | http://127.0.0.1:4751 |
| Dev page (Vite) | http://127.0.0.1:4752 |

The databases are kept outside the repo, in `~/Library/Application Support/MikuTracker/`:
- `miku.db`: real data
- `dev.db`: development
- `backups/`: database backups
- `avatars/`: character pictures
- `dev-backups/`, `dev-avatars/`: the development copy's own
- `app/`: the always-on app's copy of the latest version
- `theme-art/`: theme pictures

The app only listens on this Mac (`127.0.0.1`) until a login exists.

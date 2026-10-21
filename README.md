# MikuTracker

A personal website for tracking MapleStory (GMS) progress. It runs on one Mac, and it's built so it can move to a server later by changing settings, not code.

**Status:** v0.4.0: the feature tabs, the Ren and Pochacco themes, and the GMS EXP table tab work, and the server can look characters up in Nexon's rankings; adding characters arrives in v0.5.0. See `PLAN.md` for the plan to v1.0.0.

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
npm run dev      # development copy: http://127.0.0.1:4752 (uses dev.db)
npm start        # build and run: http://localhost:4750 (uses the real database)
npm test         # every test, in California time and UTC
```

Theme pictures go in `~/Library/Application Support/MikuTracker/theme-art/` as `pochacco.png` or `ren.png` (also `.jpg` or `.webp`). They're never committed.

## Stack

- `server/`: Express 5 + Prisma 7 (SQLite) API
- `shared/`: zod input rules used by both the server and the app
- `client/`: React 19 + Vite + Tailwind 4 app

## Ports and data

| What | Address |
| --- | --- |
| The app (`npm start`, later the always-on app) | http://127.0.0.1:4750 |
| Dev API server | http://127.0.0.1:4751 |
| Dev page (Vite) | http://127.0.0.1:4752 |

The databases are kept outside the repo, in `~/Library/Application Support/MikuTracker/`:
- `miku.db`: real data
- `dev.db`: development
- `backups/`: database backups
- `theme-art/`: theme pictures

The app only listens on this Mac (`127.0.0.1`) until a login exists.

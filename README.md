# MikuTracker

A personal website for tracking MapleStory (GMS) progress. It runs on one Mac, and it's built so it can move to a server later by changing settings, not code.

**Status:** v0.1.0, planning. There's no app code yet. See `PLAN.md` for the plan to v1.0.0, and open `docs/theme-examples/index.html` in a browser to see the approved mockup.

## Docs

- **`PLAN.md`**: what v1.0.0 includes, the versions and steps to get there, decisions, and research
- **`docs/theme-examples/`**: the approved mockup
- **`CHANGELOG.md`**: what each version changed

## Planned stack

- `server/`: Express 5 + Prisma 7 (SQLite) API
- `shared/`: zod input rules used by both the server and the app
- `client/`: React 19 + Vite + Tailwind 4 app

## Planned ports and data

| What | Address |
| --- | --- |
| Always-on app | http://127.0.0.1:4750 |
| Dev API server | http://127.0.0.1:4751 |
| Dev page (Vite) | http://127.0.0.1:4752 |

The databases are kept outside the repo, in `~/Library/Application Support/MikuTracker/`:
- `miku.db`: real data
- `dev.db`: development
- `backups/`: database backups

The app only listens on this Mac (`127.0.0.1`) until a login exists.

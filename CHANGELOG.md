# Changelog

Every version gets an entry here, the same `version` in every `package.json`, and an annotated tag `vX.Y.Z`.

## v0.1.1 (2026-10-20): plan updates

- `PLAN.md`: added avatar history (seeing each character's old looks) to "After v1.0.0". From v0.5.0, avatar images are saved under a name taken from their contents and never overwritten, so the history needs no rework later.
- `PLAN.md`: the rankings are expected to update more than once a day. The update watch at the start of v0.2.0 now only picks the time of the daily refresh.

## v0.1.0 (2026-10-20): planning and mockups

No app code yet.

- `PLAN.md`: what v1.0.0 includes, the versions and steps to get there, the testing done at every step, risks, decisions, and research (Nexon's rankings data, the GMS EXP table current as of v.271, reset times).
- `docs/theme-examples/index.html`: the approved mockup. It has the left tab rail, Home in separate sections, character tabs, the daily EXP chart, time to level, the EXP table tab with the real GMS table, and the Ren and Pochacco themes.
- `README.md` and `CHANGELOG.md`.
- `.gitignore` (which keeps `tempdata/` and theme art out of git) and `.claude/settings.json` (the commands Claude may run without asking).

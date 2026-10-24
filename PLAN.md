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

### v0.10.0: backups and the always-on app — done
Built and described in `DESIGN.md`; see `CHANGELOG.md`. (No "back up now" button and no "start over empty" command: decided 2026-10-23 they're not needed. The dev copy got its own avatars and backups folders.)

### v1.0.0: first real use — done
The always-on app in real use: the README rewritten for using it, the EXP table re-checked (still current at v.271), the Ren sky fixed after switching themes, and `npm run qa` testing the production build. See `CHANGELOG.md`.

**Decided 2026-10-23: nothing waits on real data.** Bugs noticed while using the app are fixed in whichever version is being worked on then, and the reality checks below are done once there's enough data, also in whichever version is open.

**Reality checks, once there's data:**
- **How far Nexon's rankings lag behind the game.** Next time a character levels up, note when the game showed it and when the always-on app first does; that shows roughly how often Nexon updates. (On 2026-10-23 at 08:31 UTC Nexon listed RemyRabbit at level 278, 93.3%, which matched the game as far as we know.)
- **Our EXP per day against another site** (for example mapleranks) for the same characters and days.
- **Check the real data size** (was v1.2.1; moved here 2026-10-23, since it only needs a few weeks of real use): after some real use, measure the database (snapshots), the avatar images and the backups folder, and compare them with the estimates (about 100 bytes per snapshot, so about 36 KB per character per year). Revisit the "keep forever" decision only if the real numbers are much bigger.
- **The EXP table** was re-checked on 2026-10-23: GMS is still on v.271 (whose EXP cut it includes), and v.272 (the November update, test server Oct 29 – Nov 1) isn't out yet. **Re-check it when v.272 is released.**

## After v1.0.0

**Every version here is an early plan: each one gets discussed in detail before it's built.** Version numbers go by importance (the first number for major changes), not strict semver.

### v1.1.0: Leveling line chart — done
Built as layout B of the mockup (a "Level" switch on the EXP chart); described in `DESIGN.md`, see `CHANGELOG.md`.

### v1.2.0: Weekly boss tracker — done
How it works is in DESIGN.md ("Bosses"). **Still unconfirmed:** Jupiter's prices (the wiki's 593M / 1,190.6M against masonym.dev's 591M / 1,205.2M), and whether the Heroic ×5 is applied before or after the party split (a few meso at most). Check both in the game or a newer source. History of past weeks is under "Later": the ticks of past weeks are already kept.

### v1.3.0: Daily and weekly checklist — done
How it works is in DESIGN.md ("Checklist"). **Still to check:** Flag Race's Thursday reset (from the owner; not documented in what was found), and drop Monster Park Extreme if it's removed in November (the wiki marks it as pending removal). History of past days and weeks is under "Later" (the ticks are kept).

### v1.4.0: Symbol calculator — done
How it works is in DESIGN.md ("Symbols"); the costs, Force and symbols a day are in `server/src/gameFigures/symbols.ts` with their sources. **Still to check in the game:** Vanishing Journey and Chu Chu Island giving 40 a day (we assume their story quest is done), and the weekly content's 3 clears a week of 80 (from the wiki).

### v1.5.0: Gear tab (equipped items)
**Decided 2026-10-23:** this version is **only choosing each roster character's equipped items**. Potential, Star Force and flames move to v2.0.0.
- **The game's own equipment window layout**, for the selected character (character tabs at the top, like the other tabs). **All the game's slots**, including pocket, badge, medal, emblem, secondary, heart, android and the totems.
- **Clicking a slot opens a list of items for it, scrolling vertically.** Only gear that makes sense, not the game's thousands of items: **accessories from the boss accessory set up** (Boss, Pitched, Dawn, Brilliant sets and the like), **armor and weapons from Root Abyss (CRA) up** (CRA, AbsoLab, Arcane Umbra, Eternal; Fafnir, AbsoLab, Arcane Umbra, Genesis, Destiny weapons), **the event rings** (Tenebris Expedition, Glory Guard: Justicar, Awake), and **Treasure Hunter John's Ring**. The research checks the current meta so nothing used is missing; the owner confirms the full list before building.
- **Rings:** the three event rings (Tenebris Expedition, Glory Guard: Justicar, Awake; Nexon's "1-of-3 Event Ring Selector Coupon" offers exactly these), Treasure Hunter John's Ring, and the important Oz (seed) rings: **Ring of Restraint, Continuous Ring, Weapon Jump Ring** (decided 2026-10-23).
- **Android:** left blank (no list). **Medal:** none, the Seven Day Monster Parker Medal, or the Brilliant Boss medal (Immortal Legacy, Lv. 250). **Heart:** every heart that's still relevant (only a handful). **Totems:** only the guild ones for now: Guild Castle Blue, Red and Green Brooch (Lv. 100, all stats +7, attack +7; the wiki lists them as obtainable but doesn't say where; to check in game that they're the guild shop's).
- **Only the character's own class's items** (from its job), plus items any class can wear.
- **"Other item"** with a typed name, for anything equipped that isn't listed.
- **Set counts** next to the window ("Arcane Umbra 5/7", "Pitched Boss 6/9"); the set bonus stats come with v2.0.0.
- **Item icons** (Nexon's art) downloaded once into the data folder, like the boss banners, never in git; the app itself never contacts the source.
- **No copying gear between characters** (gear can't be traded in the game).
- **Item data source:** item names and ids from the MapleStory Wiki's pages (their tables carry the ids) and Nexon's patch notes; icons and class requirements from maplestory.io's GMS data (v.270) by id. maplestory.io's search misses some items (e.g. Ren's swords, Mitra's Rage), so it's not the list's source; an item it has no icon for shows without one. Not masonym.dev's files (no license), and never extracting the game's files ourselves.
- **Weapons by job:** each job's weapon type (e.g. Ren: Sword, with an Imugi Gem secondary, from v.264's notes; Night Walker: Claw), from the wiki and patch notes; the weapon list shows that type's CRA (Fafnir), AbsoLab, Arcane Umbra, Genesis and Destiny weapons. **Secondaries** by job likewise.
- **The lists (mocked up 2026-10-23, then reviewed by the owner; final):**
  - **Armor:** Root Abyss (Royal hat, Eagle Eye top, Trixter bottom), AbsoLab, Arcane Umbra, Eternal (8 pieces at Lv. 250: hat, top, bottom, shoes, gloves, cape, shoulder).
  - **Weapons:** the job's weapon type in Fafnir, AbsoLab, Arcane Umbra, Genesis and Destiny. **Genesis and Destiny weapons are lucky items** (wiki, "JokerToSetItem"): one counts as a piece of every set that includes a weapon and has 3+ pieces equipped, unless that set's own weapon is equipped; only one lucky item counts. (v.265/v.267 also apply it to the Ignitia Set, an event set we don't list.)
  - **Secondaries, per job:** the Lv. 100 one sold by Neville (580,000 meso), the Frozen one, the Princess No one, and the Astra Secondary Weapon (v.270). E.g. Ren: Violet / Frozen / Princess No's / Astra Imugi Gem; Night Walker: Ereve Brilliance, Frozen Ereve Brilliance, Princess No's Floral Jewel, Astra Obsidian. All from the wiki's per-job tables (Frozen Secondary Weapon Box, Astra Secondary Weapon, Princess No's pages).
  - **Accessories:** the Boss Accessory set (incl. Will o' the Wisps), Pitched, Dawn and Brilliant (Original Sin of Pride, Oath of Death, Whisper of the Source, Blissful Nightmare, Immortal Legacy) sets; Reinforced and Superior Gollux; Meister earring, ring and shoulder; Gold Maple Leaf Emblem and Mitra's Rage; **Ayame's Treasure** (Princess No's belt, Lv. 140) and **Kanna's Treasure** (ring, Lv. 140); not Hayato's Treasure.
  - **Rings:** Treasure Hunter John's Ring; the event rings in their finished versions only (Heroic Tenebris Expedition Ring (Complete), Heroic Awake Ring (Lv. 4), Glory Guard Ring: Justicar); an **"Oz rings" group**: Ring of Restraint Lv. 3, 4, 5, 6, Continuous Ring Lv. 3, 4, 5, 6, Weapon Jump S/D/I/L Lv. 3, 4 (passive rings max at Lv. 4 since v.271).
  - **Hearts:** Total Control, Black Heart, Plasma, Fairy, Titanium, Liquid-Metal, Outlaw (not Lidium: a bad item, per the owner). **Medals:** Seven Day Monster Parker, Immortal Legacy. **Totems:** the three Guild Castle Brooches. **Android:** empty.
  - No Challenger-world versions; one entry per item where the game data has near-duplicates.
  - **Every listed item must be confirmed to exist in GMS** (maplestory.io's GMS data or Nexon's patch notes), not the wiki alone: the wiki's Brilliant Boss Set page listed a "Sanguinary Spirit" that isn't a GMS item.
  - **Icons:** every item has one: maplestory.io's by id, or the wiki's item image where maplestory.io lacks the item (e.g. Ren's swords, Mitra's Rage, the secondaries).
- **Rules in the window:**
  - **One special skill (Oz) ring** in the four ring slots; once one is equipped, the others are greyed out in the other slots.
  - **The passive ring slot** (v.271): a Ring of Restraint or Continuous Ring **Lv. 4+** shows a small **+** in its slot's top-left corner to equip a passive ring: Weapon Jump, or the Continuous Ring (not the one that opened the slot). Using the active ring also triggers the passive. If the slot closes, the passive ring stays saved but faded and isn't counted until it reopens.
  - **An overall covers the bottom:** the bottom stays saved but greyed out and isn't counted (stats or sets) while an overall is on; switching to a normal top makes it count again without re-equipping.
  - **Set counts** include the lucky weapon ("+1 lucky") and leave out anything not counted.
- The mockups and the gathered data are in `tempdata/gear-research/` (never committed).
### v2.0.0: Gear details, then upgrades from saved gear
Planned 2026-10-23, to build after this batch (a lot of work and testing):
- **v2.0.0, gear details:** under the equipment window, a row of the equipped items' icons; click one to set its **potential** and **Star Force**, and its **flames** from a **grid of every flame the item can roll**: stats down the side (e.g. DEX, all stat %, DEX+STR), tiers across the top; click up to 4 to add, then save.
- **v2.x, upgrades from saved gear:** calculators that use the saved gear to work out the **next best upgrades** (flames, cubes, Star Force). These reuse the standalone calculators' maths (v3.0.0+).

### v3.0.0+: Standalone upgrade calculators
Just calculators: not tied to saved gear (kept as planned; decided 2026-10-23). Their maths is also what v2.x uses on saved gear. Other sites already calculate these; ideally we use the same method. The safest source is the one those sites start from: **Nexon's published odds and formulas**. Copying a site's code, or reverse engineering it, could go against its terms, so that's checked first.
- **v3.0.0, flames:** how many flames it should take to reach a better flame score.
- **v3.1.0, potential:** how many cubes it should take for the lines you want.
- **v3.2.0, Star Force:** the expected meso, and the chance of booming, to reach a star.

### v4.0.0: HEXA (6th job) progress
A major version of its own (decided 2026-10-23: a lot of work; moved from v2.0.0 when gear details took v2). Each roster character's HEXA skill levels, entered by hand, and the Sol Erda and Sol Erda Fragments still needed to finish them. The levels also feed v5.0.0 (they matter for boss damage).
- **To research first:** the current HEXA skills and the cost of each level, for GMS's current patch.

### v5.0.0: Bosses
Which bosses each roster character **can actually do**, worked out from its stats and saved. Separate from the boss tracker (v1.2.0), which records what you *do*. Like MapleScouter: stats entered by hand, such as the stat window's boss damage, ignore defense, damage and attack, alongside the saved gear, symbols (v1.4.0) and HEXA levels (v4.0.0).
- **To research first:** what MapleScouter offers for GMS and whether its data can be used (an API, or terms that allow it). It's built mostly around KMS and Korea's official API, which GMS doesn't have. No scraping a site that doesn't allow it. Otherwise we calculate it ourselves from each boss's published requirements.
- Expected to be more work than everything before it combined.
- **Research found 2026-10-23** (from another open-source GMS project's notes, `iamnbutler/maple`, `docs/research/existing-tools.md`, researched 2026-09-06): MapleScouter is KMS-only and can't load GMS characters (GMS players use its "Enter Directly" page); its backend API is private. `RonaldLiu2143/maplecompile` has a full reverse-engineering of its damage and boss clear-rate maths (`src/lib/scouter/calc.ts`, `boss-cuts.ts`) and boss data (`boss-info-data.json`), but **no license**, so it's a reference to reimplement from, not code to copy. The same notes list sources for item stats, Star Force and cube rates (useful for v1.5.0 and v3.x).

### v6.0.0: Moving to a server (for now; likely later still)
Everything needed only when the app moves off this Mac (decided 2026-10-23). Nothing here is needed while it runs on the Mac.
- **Docker:** a Dockerfile and compose file, plus a check that the app runs in a container. Data lives on a volume (`MIKU_DATA_DIR=/data`), with `HOST=0.0.0.0` and `MIKU_IN_CONTAINER=1`, the port published only to `127.0.0.1`, and `restart: unless-stopped` doing the launch agent's job. This proves the move off the Mac works before it's needed. (Moving to Postgres is separate: it needs a fresh starting migration, and `pg_dump` for backups.)
- **Login:** needed before the app answers anywhere but the machine it runs on. Until then it refuses any other address (`config.ts`). "Whose data is this" already lives in one place (`owner.ts`), ready for it.
- **To decide then:** where it runs, HTTPS, backups off the machine, and whether to move from SQLite.

### Later, no version yet
- **Avatar history** (moved here 2026-10-23, not important for now): Every avatar a character has had, with the date each one first appeared. (The image files are already kept from v0.5.0; this adds showing them.)
- **Lookup tab** (dropped from v1.1.0 on 2026-10-23): searching any player without adding them. Its one useful extra over adding them, per-day EXP, isn't possible: Nexon only publishes current numbers, so per-day history needs our own repeated checks. Sites like MapleRanks build theirs by checking characters over and over at scale; open-source scrapers show it means getting around Nexon's per-address block (about 800 requests), which we won't do, and which would risk Nexon blocking this Mac's tracking. (Nexon's weekly board does give "EXP gained this week" for anyone, but per-day is what matters here.) If it comes back: look-ups could quietly start a small, capped tracking list, with history from the first look-up. For now, adding a character to the roster is how to follow anyone.
- **Better boss art for the planning menu** (2026-10-23): the banners are only 135 × 30, so enlarged in the planning menu they look blocky. Find higher-resolution art in the same style (the user likes the banner art, not the boss models), for every boss.
- **Boss and checklist history:** past weeks' cleared bosses and meso, and past days' and weeks' checklist ticks (moved out of v1.2.0 and v1.3.0 on 2026-10-23: not core to them; the ticks are already kept).
- **More totems and rental equipment** (noted 2026-10-23, from the gear tab's planning): add the other totems (e.g. the weekly farmable temporary ones and rental ones) and rental gear to the gear lists.
- **Export everything (JSON):** low priority. Once gear, stats and checklists are entered by hand, that typing is the most valuable data in the app; backups protect it, and an export would be a second safety net.

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
| Weekly quests and content | Thursday 00:00 UTC (Monday until v.264, Nov 2025) |

v1.0.0 only uses the daily one (UTC days). Check the weekly ones before any weekly features rely on them.

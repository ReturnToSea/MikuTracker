# Changelog

Every version gets an entry here, the same `version` in every `package.json`, and an annotated tag `vX.Y.Z`.

## v2.2.0 (2026-10-27): Star Force

- **The Star Force page**, the Gear group's third page (layout A of 5 mockups): each item that can still take stars, cheapest per 1% final damage first by its **best jump** (from where it stands, the target with the cheapest meso per 1% FD for that jump alone; e.g. 19→21★ together when 20→21★ is cheap), with the next tap's success chance.
- **For the picked item:** its stars, saved from here too (the same stars as Equipment, with Save / Cancel); a **boom cost** (plain meso) and boxes for an item too rare to risk (**Modes 1 1 4 4** or **4 4 4 4**); a summary for the target star (median, exact average and 75/90/99% unlucky costs, final damage, median and exact average booms, the chance of a boom); every next star with its pick, **unrounded** rates, costs, final damage, running totals and the best jumps; graphs of the cost to get there, the booms on the way and the cost per star.
- **The cheapest Enhancement Mode or Safeguard per star**, worked out with the boom price; the **events as checkboxes** (30% off, 30% fewer booms, 5/10/15, +1 star) and the **MVP tier** as a setting.
- **Targets:** the star to stop at for a budget, taking best jumps while they're within it.
- **Sources:** tadeucci's calculator, checked against masonym's, MathBro's, the wiki and Nexon's v.269 notes; the owner checked the rates in game. Our maths matches tadeucci's engine to the meso (every tap cost for 8 levels × 30 stars, 5 cases with events and MVP) and masonym's solver for the +1 event. The medians and unlucky costs come from 20,000 seeded runs simulated star by star (checked against tapping every run out); 30★ plans in about 0.1 s.
- **Along the way, from the owner's review of the mockups:** a blended "to here, all in" column was dropped (it credited a dear star with cheaper stars' final damage) for honest per-star figures and running totals; the cost-per-star graph stops at the target; long climbs group their boom counts into ranges (a 30★ plan booms hundreds of thousands of times, which had hung the page).
- The flames service now shares one "equipped items" helper with Star Force.
- **Mutation testing** found 90-odd gaps along the way, mostly loose tests (another class's stars, an order that happened to be right already, the graphs' data), now tested; a few lines that can't change anything simplified or marked with why (e.g. "4 4 4 4" at 20–21★, where Mode 4 is the cheapest anyway).
- **From the review pass** (10 findings, 5 fixed):
  - Typing a boom cost and ticking a box straight away could lose the cost (the box saved the cost last loaded); the pair is now saved together from the boxes.
  - The boom cost box and both budget boxes (Flames and Star Force) had no upper limit: a huge budget made the whole page fail to load; now refused in the box.
  - An MVP tier the list doesn't know (a hand-edited database) made every cost nonsense; it now counts as none.
  - Tidying: a row's star button set the target twice; a leftover alias and an oddly named type.
  - **Not changed:** the simulation runs on each click (a tenth of a second at most, for one person on this Mac); reading the gear before checking the character is yours, to save a few milliseconds.
- **From a final review after the tests and click-through** (the owner's call; 9 findings, 5 fixed, 1 planned):
  - The item panel could switch items by itself: shown without a click as "the cheapest", a save that re-ordered the row jumped it to another item, with the planned star; **the Flames page had the same flaw**. Both now stay on the item worked on.
  - Switching world kept the old item and planned star (switching character already reset them).
  - The MVP menu flipped back to "None" for a moment while saving; it now shows the setting as soon as it's saved, and an unknown saved tier reads as "none" everywhere (checked where settings are read).
  - The budget box was copied between Flames and Star Force (which is how the earlier upper-limit bug needed fixing twice): one shared box now. The Targets note said "less than" where the rule is "at most".

## v2.1.0 (2026-10-24): flames, all the way through

- **The Flames page**, under a new **Gear group** in the rail (Gear ▾: Equipment, Flames; a menu above the bar on a narrow window). The flame odds and costs planned for v2.3.0 came with it, so Potential is now v2.3.0 and the best upgrade v2.4.0.
- **The flame score:** each item's flames in main stat, from the character's stat values, with the best it could have ("133 / 207.4"). Each job's main and secondary stats are known (mages use Magic ATT; Xenon, Demon Avenger, the two-secondary thieves and Zero have their own rules). Shown under each icon on the Equipment page (coloured by how close to its best) and live in its editor.
- **Black Flames, worked out exactly** from Nexon Korea's official odds: for each item, cheapest per 1% final damage first, the meso per 1% final damage, the chance and the meso to any better roll, the average gain when it's better, the flames for a 25/50/70/99% chance, and a graph of every score a flame can give (or the cost and gain curves). Checked against mafhcow's own engine (the same to 3–4 decimals) and a million simulated flames.
- **Targets:** pick what 1% final damage is worth (2.5–40B) and see the score to stop flaming each item at.
- **Flames are edited on either page** (one saved set); on the Flames page the numbers and the order change on Save.
- **The Black Flame price** is a site setting (3m by default). **The stat values' defaults are the owner's** (1 ATT = 4, 1% all stats = 10, secondary 0.125, 1% boss/damage = 12) and the "1 HP" box is gone (a Demon Avenger's main stat already is HP).
- **The picked character carries over** between the Gear pages (and after reloading, in that browser tab).
- **From the review pass** (9 findings, 7 fixed):
  - A Black Flame price over 2,147,483,647 meso (e.g. 2500 typed for 2.5B) passed the check and then crashed in the database; it's now refused with a message.
  - Targets counted a roll just under the stop score as reaching it (the stop score was rounded to the nearest hundredth instead of up), so it showed slightly too few flames.
  - On a wide window the Gear tab flipped its (hidden) menu state on every click, which could show a stray menu after narrowing the window.
  - A failed save's message stayed after switching character or world on the Flames page.
  - Any settings save (theme, world) recalculated the Flames numbers; now only the price does.
  - "Flames needed" showed "—" (never) for extremely unlikely upgrades (a chance near 1 in 10¹⁷ rounded away); now exact.
  - The page's live score used its own copy of the server's rounding rule; both now share one (`flameLinePoints`).
  - **Not changed:** the board is recalculated on each request (64 ms for 14 items, so not worth a cache); Demon Avenger's STR lines score 0, as in mafhcow's calculator (asked the owner).
- Mutation testing found 62 gaps along the way (most were the Targets numbers and edge cases of the maths, now tested; a cache removed; an older refresh test that passed by accident, counting the Flames requests as gear reloads, fixed).
- Tests: the maths with hand-worked numbers and mafhcow's figures; the page's clicks and saves; bugs planted by hand in the page (8, all caught after one test was extended); the click-through gained 20 checks (the Flames page, the phone-width menu, the remembered character), and found a layout bug at phone width (the flame grid pushed the page sideways), now fixed.

## v2.0.1 (2026-10-24): Star Force fixes after the owner's review

- **Secondaries' stars use the armor figures**, not the weapon figures: Nexon Korea's Astra notice says Astra secondaries gain like Lv. 200 armor (v2.0.0 followed masonym's choice). Kataras (the Astra Blade follows the Arcane Umbra katara's rule) and Zero's Lapis still gain like weapons. An Astra secondary at 22★ now adds ATT +106 (Lv. 200 armor), not the weapon figures.
- **Every star adds the item's class stats** ("only class-relevant stats": the wiki; masonym agrees). v2.0.0 gave 16★–22★ only to the stats an item shows, a rule that came from StrategyWiki alone.
- **StrategyWiki is no longer a source** (the owner: too outdated to rely on). What it backed now stands on other sources: 17★ weapons at Lv. 128–159 (masonym and a Korean weapon table: Fafnir 16★ +8, 17★ +9), and GMS's Lv. 151+ potential step (a GMS bug report on Nexon's forum, the wiki, brendonmay's calculator). Shoes' +2 speed from 11★ is now unconfirmed (masonym against the wiki).
- **Decided with the owner:** Destiny Stage 1 is fixed at 22★ (Nexon's patch note); Stage 2 goes to 25★ (the wiki and NamuWiki; nobody on Heroic has one yet, so assumed true). A physical weapon's Magic ATT flame is the same as its ATT flame (as the grid already showed).
- **NamuWiki's weapon table** (pasted by the owner) confirms every weapon figure we had for 16★–25★, settles 17★ at Lv. 128–159 (+7/+8/+9; the wiki was wrong), and confirms Lv. 200–249 weapons' 26★–30★ (+37 … +41) and Lv. 250 weapons' 16★–22★ (both had been masonym's guesses). Korea's star figures match GMS's sources everywhere they overlap.
- **Still unknown anywhere:** Lv. 138–199 weapons from 26★ and Lv. 250 weapons from 23★ (nobody stars those that far; masonym's estimates stay, marked on the page).
- **From the review pass** (7 findings; 6 addressed):
  - Zero's Lapis (secondaries) could be set below 22★, and Genesis Lapis showed no stars at all; they now come with 22★ like the Genesis and Destiny weapons.
  - Shoes' disputed +2 speed from 11★ wasn't flagged on the page; it is now, like the unknown weapon figures ("this item's figures aren't confirmed").
  - Items showing no main stat (hearts) had no test for getting class stats from stars; one now pins it.
  - The potential step's crit rate and damage lines lost their source with StrategyWiki; Nexon's own tables back them (Korea raises exactly those lines by 1% from Lv. 120–200 to 201+), and the notes now say so consistently.
  - The bracket lookup was written twice.
  - **Not changed:** a typed katara gains like armor, since a typed item has no type to say "katara" (rare; noted as a limit).
- **From a second review pass** (the owner's call: each review finds new things; 9 findings, 7 addressed):
  - The shoes' note said every star from 11★ was "not confirmed by any source", which overstated it; the page now says exactly what's disputed (speed and jump from 11★, a difference of 1), and the unknown weapon figures get their own wording. The server sends these notes with each item.
  - A Lapis or Genesis item saved below its new 22★ minimum (possible before this version) is now flagged ("Saved with 10★, but this item comes with 22★"), like the existing above-limit note.
  - The generator now checks the Lapis type after fixing wiki typos, and reports any Genesis or Destiny item left without stars, so the Lapis bug can't quietly come back.
  - A typed secondary now says it gains stars like armor (a katara would gain like a weapon).
  - A test-only helper was removed, and the bracket lookup no longer copies the list on each call.
  - Non-Astra kodachis and bladebinders are taken to gain like armor, a gap no source covers (noted in DESIGN.md).
  - **Not changed:** a weapon showing one main stat still gains both its class stats from stars (the wiki's "class stats", and masonym gives all four).
- **Mutation testing rule changed** (the owner, 2026-10-24): before each version, only the files whose code changed; a full run only for a major version or when something shared changed (test setup, configs, widely used helpers). CLAUDE.md and the mutation-audit skill say so.
- **Tests:** 583 server and 321 app tests, including NamuWiki's weapon table for every bracket and the Genesis Guards' fixed 22★ worked out by hand (ATT +170 from its own 172). Mutation testing of the changed code: 100%. `qa:check`: 222/222.

## v2.0.0 (2026-10-24): gear details (stars, potential, flames, hammers)

- **Under the gear window** (layout A of 5 mockups): a row of every equipped item's icon, and an editor for the picked item, with Save / Cancel; clicking another item drops unsaved changes without asking (the owner's choice).
  - **Star Force** laid out as in the game (1–15 on top, 16–30 below, in groups of 5), each item's own limit, and what the stars add; Genesis weapons fixed at 22★, Destiny weapons from 22★.
  - **Potential:** a rank and 3 lines picked from the lines that kind of item can really roll at that rank and level. No bonus potential: Kronos and Hyperion are Heroic worlds, which don't have it (nor scrolling).
  - **Flames:** a grid of every flame the item can roll, with real values; boss items tiers 3–7, others 1–5; up to 4.
  - **Exceptional Hammers** on the six items that take them (Original Sin of Pride and Immortal Legacy up to 3, the four Pitched pieces 1).
  - **A summary** like the game's tooltip: each stat's total with its parts (base, stars, flames, hammers).
  - **Typed "Other items"** get the same editor once you give their level, boss tick and (weapons) attack.
  - **Stat values** per character under the window (1 ATT = 2.44 main stat, 1% All Stat = 12.21, …, 0.785% final damage per 100 flame score; mafhcow's defaults), for v2.1.0's flame scores.
  - **One Guardian Angel Ring and one Dawn Guardian Angel Ring** at a time (the wiki marks them "exclusive equipment").
- **The figures, every level and item type, each checked against a second source** (the owner's rule for this version):
  - **Star Force:** the wiki's tables, checked against masonym.dev (every armor figure matches) and StrategyWiki. Where they disagree, two agreeing sources win: 17★ weapons at Lv. 128–159, shoes' speed from 11★, armor HP from 3★. **Not confirmed by any source** (marked on the page): weapons from 26★ and Lv. 250 (Destiny) weapons, which masonym took from another simulator's guess; secondaries following the weapon table.
  - **Flames:** the wiki's tables; which stats each kind of item rolls and the level rules from **Nexon Korea's official page**; checked against mafhcow's calculator (weapon attack flames rounded up). Gollux items and the Horntail necklaces roll normal flames; Immortal Legacy (the only medal that can) and Ayame's Treasure roll boss flames.
  - **Potential:** **Nexon Korea's official tables for every kind, rank and level range**, read by hand (`scripts/potential-fetch.mjs`: 2,000 requests, one every 2 seconds; `scripts/potential-data.mjs` translates them into GMS's wording, and every line translated). brendonmay's cubing calculator only has Lv. 120–200, and adds 1% for Lv. 160+ by its own admission a guess. **GMS's one known difference is applied:** items from Lv. 151 get Korea's Lv. 201+ values (13% instead of 12% at Legendary), and +1% on the right lines where Korea has no Lv. 201+ table. Checked against StrategyWiki's GMS tables: 2,257 values agree; the 119 that differ are Max HP % at Lv. 160 (unconfirmed; brendonmay sides with us) and Korea's current lower Lv. 50 values for Demon Aegis and hearts.
  - **Each item's own figures** (base stats, star limit, boss flames, what it can take) from its own wiki page, through `scripts/gear-data.mjs`.
- **From the review pass** (9 findings; 8 addressed):
  - The potential file it read was built mid-download, with 7 of 20 kinds (rebuilt complete; a test now checks every item's kind has tables).
  - Swapping an item briefly showed the old item's stars and flames on the new one (and could save them onto it).
  - A typed item could claim a different kind than its slot (a "weapon" in the hat slot).
  - Changing a typed item's level or boss tick left stars, flames or lines it could no longer have.
  - Typed items got no stats from 16★–22★, typed gloves no attack from stars, and a typed weapon with no attack offered "+0" attack flames.
  - The slot order and the per-kind rules were written in several places.
  - **Not changed:** the StatValues migration's "AUTOINCREMENT" is Prisma's own doing and harmless (the id is always the character's).
- **Found by checking the figures:** the cross-check against StrategyWiki showed Lv. 160 overalls, secondaries, emblems, belts, earrings and hearts were missing GMS's 13% (Korea has no Lv. 201+ table for them; fixed). My first cross-check script also misread StrategyWiki's chance tables as values.
- **Tests:** 583 server and 321 app tests, in California time and UTC, many against hand-worked numbers (a Lv. 200 hat at 22★: STR +145, ATT +106; the Genesis Sword's fixed 22★: ATT +228; every flame bracket). Full mutation testing: 100% (server and shared, and the app's logic), after fixing the gaps it found: secondaries and magic weapons' stars, gloves with only magic attack, DEX/INT/MP flames, the save hooks, details staying with their slot (one test only passed because the database happened to list a detail-less row first), and code that could never change a result (simplified; three boundary coincidences at Lv. 120 and Lv. 200 marked with their reason). `qa:check`: 222/222, with 17 new checks (22★ and an INT T7 flame on a Lv. 160 hat worked out by hand: INT 239, LUK 176, Magic ATT 95; the 13% lines; saving; dropping unsaved changes; stat values; bad requests).
  - **Planted bugs in the page** (14): all caught.
  - **My mistakes along the way:** a mockup's star figures guessed and stopped at 22★ (the owner caught it); a test that only passed because its check was ignored; tests that didn't wait for the board, or rendered two pages at once; test titles and item names typed wrong; and pre-emptive mutation-testing exemptions I added and then removed.

## v1.5.0 (2026-10-24): the gear tab (equipped items)

- **The Gear tab** (in place of the last TBD tab): each character's equipped items in **the game's own equipment window**, all its slots plus the three totems. Click a slot for its list (scrolling, in groups, each item with its icon, level and set), None, or **Other item** with a typed name. Stars, potential and flames are for v2.0.0.
  - **Only the character's class's items**, weapons by the job's weapon types. A job the list doesn't know yet is offered every item, with a note.
  - **The rules the owner set:** one special skill (Oz) ring in the ring slots; a Ring of Restraint or Continuous Ring Lv. 4+ shows a **+** for the passive ring slot (Weapon Jump, or the Continuous Ring when it isn't the active one), and a passive ring whose slot closes stays saved, faded, uncounted; **an overall greys out a saved bottom** without unequipping it.
  - **Set counts**, with a lucky Genesis or Destiny weapon's **+1** for each armor set with 3+ pieces.
- **The item list** (633 entries, every job's weapons and secondaries) is built by hand from the MapleStory Wiki with `scripts/gear-data.mjs`, to re-run after a GMS patch; **icons** are downloaded by hand into the data folder's `item-icons/` with `scripts/gear-icons.mjs` (never in git; the app never contacts the wiki).
  - **Changed from the plan:** the plan said to confirm items in maplestory.io's GMS data, but its newest real GMS data is v.211, so it didn't know items like Oath of Death. The GMS check is now: **the item has its own page on the GMS wiki** (the Korean-only "Sanguinary Spirit" has none, and is left out). Ids, pictures, levels, jobs and types come from each item's own page, because the set pages had slips (AbsoLab's Bandit and Pirate Suits sharing an id, a fan typed "Chain", an id "1254p26"). Three items' own pages gave another item's id (Royal Wanderer Hat, Eternal Pirate Coat, Liquid-Metal Heart); those use the set page's id or, for Liquid-Metal Heart, the one in maplestory.io's old GMS data (1672077).
  - **Small choices made along the way:** the Astra secondary is listed at its final stage (like the finished event rings); items with an untradable and a tradable version list the first; lucky weapons aren't also counted as Eternal pieces (the wiki lists them on the Eternal pages; counting both would count them twice); Beast Tamer isn't in the job table (Beast Tamers were converted into Lynn).
  - **Gaps that come from the game:** Dual Blade has 3 secondaries (Neville sells no Lv. 100 katara) and Erel Light 3 (newer than the Frozen box); Dawn Warrior, Hero and Paladin have 5 (two Astra choices); Zero has only its Genesis and Destiny weapons.
- **From the review pass** (10 findings; 7 addressed):
  - A name typed in "Other item" but not used stayed in the box when switching slots, so "Use" could save it in the wrong slot.
  - A bottom under an overall couldn't be selected, so it couldn't be emptied without taking the overall off. It's still greyed out and uncounted, but can be picked now.
  - The server accepted a typed name in the passive ring slot (the page never offers one); it's refused now.
  - A job named like a built-in property ("constructor") would have crashed the board.
  - Each item group scrolled on its own inside the list.
  - The board checked the disk once per item for icons, and the page looked items up slowly on every render.
  - **Not changed:** the Oz rules are written on both the server (what's refused) and the page (what's shown), as with the other tabs, each side tested; Oz ring levels share one icon (the wiki has one per ring); icons are cached by browsers for 30 days (an item's picture doesn't change).
- **Tests:** 504 server and 290 app tests, in California time and UTC, including facts the item list must always hold (unique keys, every job can fill its weapon and secondary slots, the owner's picks are there and the Korean-only item isn't, Ren's and Night Walker's four secondaries). Full mutation testing: 100% (server and shared, and the app's logic). `qa:check`: 205/205, with 24 new checks for the Gear tab (Kanna's six fans and four secondaries, the overall, the lucky +1, the passive ring slot, typed items, saving, bad requests, a narrow window).
  - **Found by mutation testing:** missing checks for a character's passive slot opened by another character's ring, rings that aren't special skill rings beside the opener, the save hook (instant display, one at a time, reloads), each armor set's lucky bonus, and two test files that read the item list on load (a broken list showed as "nothing failed"). A name check was simplified.
  - **Planted bugs** in the page (overall, the +, Oz rings off, typed names, the faded passive ring, and the three review fixes): all caught.
  - **My mistakes along the way:** a first generator run that trusted maplestory.io (it dropped real items like Oath of Death and the Frozen secondaries); job text cut at the ")" in "Arch Mage (Fire, Poison)"; a click-through check that counted every slot instead of the empty ones; and page tests that didn't wait for the board, or used a fake server that forgot saves.

## v1.4.0 (2026-10-24): the symbol calculator

- **The Symbols tab** (in place of the next TBD tab), the layout the owner described: character tabs; an Arcane / Sacred switch with a card per symbol (level, symbols held, days a week, weekly clears); the tab's Force and when everything is maxed with the meso to go; each symbol's time to max; a selector coupon box with **two suggestions** (everything maxed soonest, and the most Force soonest); and a Force forecast graph.
  - Sacred includes Tallahart and Geardock (Grand Sacred, which adds to Sacred Force). Geardock has no selector coupon; Sacred selectors cover Tallahart since v.271.
  - A calculator: saved as typed, per character; the checklist doesn't feed it.
- **Costs from the game's formulas** (the MapleStory Wiki's cost tables match them for all 194 rows), worked out in whole tenths: in ordinary decimals, 7 of the 194 rows come out 10,000–100,000 meso too low (Vanishing Journey Lv. 2, Cernium Lv. 5 and 10, Arteria Lv. 5 and 10, Tallahart Lv. 5, Geardock Lv. 5; e.g. Cernium Lv. 5 → 6 would be 331,400,000 instead of 331,500,000). Symbols a day as of v.271 (Arcane dailies 40, weekly content 80 per clear; Cernium 30, the rest 15).
- **From the review pass** (9 findings; 7 addressed):
  - A typed value fitted back to the current one (Lv. 25 on a maxed Arcane symbol) stayed in the box, and was still sent to the server. The box now shows what's kept, and an unchanged value isn't sent.
  - Saved values are fitted to the current game figures when the page loads, so a later patch lowering a top level can't show "NaN" Force.
  - The graph says when it shows only the first two years, and says "nothing is levelling up" instead of drawing an empty box.
  - The "maxed soonest" suggestion stops once everything is covered, so typing a huge coupon count doesn't loop once per coupon.
  - A leftover one-item list in the rail.
  - **Not changed:** the server rebuilds the cost tables on each request, and the page keeps some small logic inline (covered by page tests and planted bugs). Both are fine for one person on this Mac.
- **Tests:** 466 server and 263 app tests, in California time and UTC. Full mutation testing: 100% (server and shared, and the app's logic). `qa:check`: 181/181, with 15 new checks for the Symbols tab, several against hand-worked numbers (Arcana ≈ 2.3 days and Esfera ≈ 24.2 days to max, 258.59M meso to go, where 300 coupons go), plus saving, the Sacred tab, bad requests and a narrow window.
  - **Found by tests and planted bugs:** an emptied number box saved 0 instead of putting the old value back; with nothing unlocked, the coupon box said "never" and the graph's dates piled up and ran off the edge.
  - **Found by mutation testing:** missing checks for a maxed symbol with no days, symbols arriving exactly at a level's cost, coupons between symbols with different rates, locked symbols in the suggestions, and the symbol saves' order and reloads. Several conditions that couldn't change a result were simplified away.
  - **My mistakes along the way:** a wrong hand calculation (weekly clears included), a test comment claiming a row was a rounding case when it wasn't (Cernium Lv. 5 is; Lv. 9 isn't) and a changelog line naming Carcion among the rounding cases (it isn't: 7 rows are, listed above), a click-through check matching the footnote's "Not unlocked", and a test that changed the fake "last check" before the page had its first answer (the same race was in the Bosses and Checklist tests, which passed by luck: all three wait now).

## v1.3.0 (2026-10-23): the daily and weekly checklist

- **The Checklist tab** (in place of the next TBD tab), layout C of five mockups: one character at a time, with tabs showing each one's counts ("D 6/14 · W 5/12").
  - **Daily and Weekly side by side** (one-offs under Weekly), each split into **Arcane symbols, Sacred symbols and Other** (the owner's addition after picking C), with each task's level and its limit or "custom" badge.
  - **Limits are enforced when ticking:** a task shared per world or per account (Ursus once per account, Monster Park 2 characters per world, Epic Dungeon 2 per account, …) is greyed out on the others once its limit is used, saying who did it. Per account covers both worlds.
  - **A side panel** with the daily and weekly countdowns in your time, and who used each limited task.
  - **Resets** like the boss tracker: a tick belongs to its day or week, so nothing is deleted and past ticks are kept for a history later; the page reloads at a reset and after each check of Nexon.
- **The planning menu:** every task in two columns, by reset and category, levels shown (flagged when above the character's) but not enforced.
- **Your own tasks:** name, category, a daily or weekly reset (any day) or none (a one-off), which worlds, and a limit (per character, or N characters per world or account). Editable and deletable from the planning menu.
- **The presets** (`server/src/gameFigures/checklist.ts`, as of v.271): the 6 Arcane River and 8 Grandis dailies, Monster Park, Ursus; the 6 Arcane River weeklies, Erda's Request, Epic Dungeon, Monster Park Extreme, Legion Weekly Dragon, Guild Culvert and Flag Race, Mu Lung Dojo. **Research found that weekly content moved to Thursday 00:00 UTC in v.264 (Nov 2025)**: the plan's old "weekly quests: Monday" was out of date.
- **Shared:** the game's weekly reset day (`WEEKLY_RESET_DAY`), weeks from any day (`weekStarting`), and the reset clock used by the Bosses and Checklist tabs (`useResetClock`).
- **Fixed: the database test could crash the test run.** Its "migrations match the schema" check started Prisma with a blocking call, which sometimes crashed the process at exit when tests run in worker threads, as mutation testing's do (it crashed two runs in three that way). It made today's full mutation run fail before testing anything. It now runs Prisma without blocking (six threaded runs out of six pass).
- **Fixed: after a reset, if this Mac's clock is ahead of the server's,** the page asked once, got the old period back, and never asked again (on the Bosses tab too, from v1.2.0). It now asks again every 10 seconds until the reset moves.
- **Removed:** reloading the Bosses tab's data when characters change on Home. That tab isn't on screen then, and it loads fresh when opened (found by mutation testing: nothing could notice the reload).
- **From the review pass** (10 findings, all addressed):
  - Changing a custom task's worlds left its ticks on the other world, where they could block a per-account limit with no way to untick them. Moving a task off a world now takes it off that world's characters.
  - Changing a daily task to weekly could make today's tick count as this week's (a weekly period from Friday and Friday's date had the same name). Weekly periods are now named "week-…".
  - The board loaded every tick ever and repeated queries per limited task; it now reads only the current periods, in a few queries.
  - The period calculation moved from services/ to calc/ (the project's layout rule), with its own tests; "Thursday" is now one shared constant instead of five copies.
  - A tick's error stayed on screen after switching character or world; an old delete error could show on a new task form; the count box accepted any number (over 50, the browser now refuses to send the form).
- **Tests:** 445 server and 234 app tests, in California time and UTC. Full mutation testing: 100% (server and shared, and the app's logic); harmless narrowing in the board's database reads is marked with reasons. `qa:check`: 166/166, with 21 new checks for the Checklist tab (planning, categories, ticks kept after reloading, Ursus blocked across both worlds, Monster Park's 2 per world, a custom Monday task, daily resets, deleting a custom task, bad requests, a narrow window).
  - **Found by tests and planted bugs:** clearing the count box and typing "3" gave 13 (the box refilled itself with 1); a weekly task saved without touching the day would have been sent with none (the box showed Thursday anyway).
  - **Found by mutation testing:** missing checks for two characters with different plans, two limited tasks at once, unticking one task among several, and a world change leaving other tasks and the staying world's ticks alone; the weekday names; reloads limited to the checklist.
  - **My mistakes along the way:** a test helper that called the fake server twice, a broken planted bug (an unclosed bracket), click-through checks that matched "Monster Park Extreme" for "Monster Park" or compared uppercase headings, and an incremental mutation result reused after I added a check inside an existing test (rerun with --force).

## v1.2.0 (2026-10-23): the weekly boss tracker

- **The Bosses tab** (in place of the first TBD tab), for one world at a time like Home: layout A of five mockups, worked on over three rounds.
  - **A card per character**, in one row that scrolls sideways: its planned bosses as a checklist with each boss's banner, difficulty, party and meso per person, and Black Mage under "Monthly". Only planned bosses can be ticked; ticks are saved at once.
  - **The summary:** meso so far out of planned this week, bosses cleared, the world's crystals against its 180 limit, Black Mage's meso separately (monthly), and the countdown to the weekly reset in your time.
  - **The 14-crystal limit:** past a character's 14 weekly crystals, the least valuable are marked "not counted" with a warning (and past the world's 180, the least valuable of the rest).
  - **Resets:** weekly at Thursday 00:00 UTC, Black Mage on the 1st of each month. Nothing is deleted at a reset: a tick belongs to its week (or month), so a new week starts empty and past weeks are kept for the boss history later. The page reloads by itself when a reset passes.
- **The planning menu:** every boss once in game order, as big cards 2 per row, with its difficulty (one per boss) and party size (up to what the game allows: 3 for the newest bosses, 2 for Extreme Lotus), and the meso per person. The plan stays week to week. Save, Cancel, Escape, or a click outside.
- **Boss prices** (`server/src/gameFigures/bosses.ts`, as of v.270): the MapleStory Wiki's table, checked against masonym.dev's data (they agree on 55 of 57 prices; Jupiter's stays unconfirmed), ×5 for Heroic worlds, split equally and rounded down. The limits and reset times come from Nexon's v.255 patch notes.
- **Boss pictures:** the game's boss banners, in the data folder's new `boss-art/` (never in git: Nexon's art), at their real size on the cards and 2× with sharp pixels in the menu. Better art for the menu is on the "Later" list (smooth enlarging and Real-ESRGAN were tried and turned down).
- **Fixed: the QA copy could leave its copy of your data behind** in the temporary folder when stopped. Stopping from two places at once (a signal, and a part ending because of it) returned early from the second and exited before deleting. Found when a copy was left over today; it happened when the stop reached every part at once, as Ctrl+C can.
- **From the review pass** (9 findings; 7 fixed):
  - A quick untick right after a tick could send "ticked" twice (the box only changed when the board reloaded). Ticks now show at once and are sent one at a time, in order.
  - The Bosses tab didn't reload after a refresh while it was open, so levels and avatars went stale. (I had removed the line that did it earlier, thinking it did nothing; the review was right that the tab needs to watch for refreshes itself.)
  - A future patch removing a difficulty or lowering a party limit would have made the whole tab fail to load, with the planner unreachable to fix it. Old plans now load: removed entries are left out, oversized parties count as the largest allowed.
  - After a reset, the page could ask for the board every second while the server's clock was behind. It now asks once per reset.
  - A tick and a plan save at the same moment could leave a tick for a boss no longer planned. The tick is now checked and saved in one transaction.
  - The "is this your character?" check had three copies; there's now one, `ownCharacter()`, for when login comes.
  - Plans are matched with a lookup instead of a search per boss.
  - **Not changed:** loading the full character list for the tab and checking the 29 picture files on each load. Both are negligible for one person on this Mac.
- **Tests:** 411 server and 206 app tests, in California time and UTC. Full mutation testing: 100% (server and shared, and the app's logic). Two mutants are marked as harmless with their reasons: the database filter that only narrows what's read for the board, and the name of the tick queue. `qa:check`: 145/145, with 27 new checks for the Bosses tab (planning, the 14-crystal limit, Extreme Lotus's party of 2, Escape without saving, ticks kept after reloading, weekly and monthly resets, the other world, bad requests, a narrow window).
  - **Found by mutation testing:** nothing checked that unticking one boss leaves the others ticked, that the world's crystal count leaves out a character's over-14 ones, or that ticking reloads only the board. And a tie-break I wrote between equal crystals did nothing (JavaScript's sort already keeps their order), so it's gone.
  - **Found by planting bugs in the page by hand:** 15 of 16 were caught at first. The miss: the page could have reloaded the board every second without any test noticing. That's checked now.
  - **My mistakes along the way:** test expectations that put Zakum in a plan twice, forgot a character on Hyperion, and misread how the browser tool reports a disabled section; a test variable typed too narrowly; and the useful refresh line I removed (above).

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

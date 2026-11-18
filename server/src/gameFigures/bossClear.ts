import figures from "./boss-clear.json";

// The boss clears (v4.1.0): which bosses a character can clear, by MapleScouter's method, as
// chablades/mapledoro ported it from MapleScouter's page (its code has no license: a reference, read as
// data; the maths is calc/bossClear.ts, our own). Research in tempdata/v41/; decided with the owner
// 2026-11-04.
// - Each boss difficulty (boss-clear.json, rebuilt by hand with scripts/boss-clear-data.mjs, dated):
//   MapleScouter's crowdsourced cut (the score that clears it solo: `cut`; or, a boss with no solo mode, a
//   full party's member's: `partyCut`), its difficulty rate, level, defense, Arcane and Sacred Force and
//   party size, in MapleScouter's order (roughly hardest first), and the level it lets you in at. Its HP
//   per phase: MapleScouter's Boss Info page (KMS figures).
// - The tables below: MapleScouter's (mapledoro's reading of its page code), but where marked.

export interface BossFigure {
  name: string; // MapleScouter's id (kalos, blackMage…)
  label: string; // the English name
  difficulty: string; // Easy, Normal, Hard, Chaos, Extreme, Champion, Destiny
  level: number;
  guard: 300 | 380; // its defense (%)
  arcane: number | null;
  sacred: number | null;
  partyLimit: number;
  cut: number | null;
  partyCut: number | null;
  easyRate: number;
  entryLevel: number;
}
export interface Phase {
  name: string;
  hp: number[]; // each HP bar, or each monster fought at once
}

// The GMS patch the figures are for, and the day we rebuilt them (shown under the boss clears: the owner, v4.4.0).
export const BOSS_FIGURES = { patch: figures.patch, generated: figures.generated };
export const bossFigures = (): readonly BossFigure[] => figures.bosses as BossFigure[];

// Challenger World's own boss (v4.2.0): Mayrin, Season 4's event boss, shown for characters on Challenger only
// (the owner, though MapleScouter's v.272 list shows it to everyone), in MapleScouter's place for it. Its
// figures are mapledoro's like the others' (v4.4.0; they were worked back by hand from one class before).
// Its damage: 95% the HEXA figure's, 5% MapleScouter's "Normal" one (mapledoro's reading of MapleScouter's
// page code).
const CHALLENGER_ONLY: ReadonlySet<string> = new Set(["maerin"]);
export const MAYRIN_MIX = { hexa: 0.95, normal: 0.05 } as const;
// The bosses a character can be shown: every world's, and on Challenger its own too.
export function bossesFor(challenger: boolean): readonly BossFigure[] {
  return challenger ? bossFigures() : bossFigures().filter((b) => !CHALLENGER_ONLY.has(b.name));
}
// A Champion difficulty has the HP of the one it's built on (the owner: it's harder through damage limits
// and its timer, not HP).
const CHAMPION_HP: Readonly<Record<string, string>> = { seren: "hard", blackMage: "hard", verusHilla: "hard", kalos: "normal", lotus: "hard" };
export function phasesOf(b: Pick<BossFigure, "name" | "difficulty">): Phase[] | null {
  const diff = b.difficulty === "Champion" ? CHAMPION_HP[b.name] : b.difficulty.toLowerCase();
  const hp = figures.hp as Record<string, Phase[]>;
  const key = `${b.name}_${diff}`;
  return Object.hasOwn(hp, key) ? hp[key]! : null;
}

// The level gap: damage (%) by the character's level minus the boss's, from 5 above (and more) down to 40
// below (and more).
export const LEVEL_GAP: Readonly<Record<string, number>> = {
  5: 120, 4: 118, 3: 116, 2: 114, 1: 112, 0: 110,
  [-1]: 105.3, [-2]: 100.7, [-3]: 96.2, [-4]: 91.8, [-5]: 87.5, [-6]: 85, [-7]: 82.5, [-8]: 80,
  [-9]: 77.5, [-10]: 75, [-11]: 72.5, [-12]: 70, [-13]: 67.5, [-14]: 65, [-15]: 62.5, [-16]: 60,
  [-17]: 57.5, [-18]: 55, [-19]: 52.5, [-20]: 50, [-21]: 47.5, [-22]: 45, [-23]: 42.5, [-24]: 40,
  [-25]: 37.5, [-26]: 35, [-27]: 32.5, [-28]: 30, [-29]: 27.5, [-30]: 25, [-31]: 22.5, [-32]: 20,
  [-33]: 17.5, [-34]: 15, [-35]: 12.5, [-36]: 10, [-37]: 7.5, [-38]: 5, [-39]: 2.5, [-40]: 0,
};
// Arcane Force: damage (%) by the character's share of the boss's (%), the first row reached (below them
// all: 10). Sacred Force: damage (%) by the character's minus the boss's (below them all: 5).
export const ARCANE_GAP: readonly (readonly [number, number])[] = [[150, 150], [130, 130], [110, 110], [100, 100], [70, 80], [50, 70], [30, 60], [10, 30]];
export const ARCANE_GAP_FLOOR = 10;
export const SACRED_GAP: readonly (readonly [number, number])[] = [[50, 125], [40, 120], [30, 115], [20, 110], [10, 105], [0, 100], [-10, 90], [-20, 80], [-30, 70], [-40, 60], [-50, 50], [-60, 40], [-70, 30], [-80, 20], [-90, 10]];
export const SACRED_GAP_FLOOR = 5;
// Each gap's best (the cuts are measured there): level 5 above (120%), Arcane 150% of the boss's (Black
// Mage: 110%, its own most), Sacred 50 above (125%).
export const LEVEL_TOP = { lead: 5, damage: 1.2 } as const;
export const ARCANE_TOP = 1.5;
export const ARCANE_TOP_BLACK_MAGE = 1.1;
export const SACRED_TOP = { lead: 50, damage: 1.25 } as const;
export const ARCANE_CAP = 1750;

// The tags, by the clear rate (the damage over the cut): the first row reached. A boss with a solo mode,
// by its party size (Possible from 110%: MapleScouter's, not mapledoro's 130%, the owner); one without, by
// how many like you a party needs (3: for a 3-member boss; the rest for a 6-member one).
export const SOLO_MIN = 0.9;
export const SOLO_TAGS: Readonly<Record<number, readonly (readonly [number, string])[]>> = {
  6: [[2, "Easy"], [1.1, "Possible"], [SOLO_MIN, "Solo Min"], [0.25, "Party-able"], [0.15, "Party Min"]],
  3: [[2, "Easy"], [1.1, "Possible"], [SOLO_MIN, "Solo Min"], [0.36, "Party-able"], [0.3, "Party Min"]],
  2: [[2, "Easy"], [1.1, "Possible"], [SOLO_MIN, "Solo Min"], [0.55, "Party-able"], [0.45, "Party Min"]],
  1: [[2, "Easy"], [1.1, "Possible"], [SOLO_MIN, "Solo Min"]],
};
export const PARTY_TAGS: Readonly<Record<number, readonly (readonly [number, string])[]>> = {
  3: [[2.7, "1p Min Cut"], [1.35, "2p Min Cut"], [0.9, "3p Min Cut"]],
  6: [[5.1, "1p Min Cut"], [2.55, "2p Min Cut"], [1.7, "3p Min Cut"], [1.275, "4p Min Cut"], [0.9, "6p Min Cut"]],
};

// Ascent's timer bonus: its 3 uses are spread over a 20-minute fight, one per 5.667 minutes; Hard Lucid's
// own divisor.
export const ASCENT = { minutes: 20, perUse: 5.667, uses: 3, hardLucid: 0.4 } as const;
// Kaling's figure moves with the Ascent core (mapledoro's fit, within 0.031% of MapleScouter's answers).
export const KALING_ASCENT_WEIGHT = 1.944;
// Each Sacred symbol's +20% counts only against its own region's boss once maxed (mapledoro's, the owner);
// the Symbols page's ids.
export const BOSS_SYMBOL: Readonly<Record<string, string>> = { seren: "cernium", kalos: "hotel-arcus", adversary: "odium", kaling: "shangri-la", maleficStar: "arteria", limbo: "carcion", bardrix: "tallahart", jupiter: "geardock" };
// The Genesis Pass's Power of the Adversary: against the Arcane River bosses, Lotus and Damien, ATT +20, All
// Stats +20 (a Demon Avenger: HP +1,000), boss damage +10%, IED 10%, and Arcane Power +150.
export const GENESIS_PASS = { bosses: new Set(["lucid", "will", "gloom", "verusHilla", "darknell", "blackMage", "lotus", "damien"]), att: 20, allStat: 20, daHp: 1000, boss: 10, ied: 10, arcane: 150 } as const;

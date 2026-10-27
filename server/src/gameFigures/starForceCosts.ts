// What Star Force costs and how likely each tap is (GMS, v.269 and after). Sources, read 2026-10-27:
//   - starforce.tadeucci.dev (rates.js, simulator.js): the rates after star catching was removed (its
//     +5% folded in, checked against the in-game panel), the v.269 Enhancement Modes' rates and cost
//     multipliers, Safeguard, events, MVP;
//   - masonym.dev (src/app/star-force/utils.js): the same rates, modes, costs, boom drops and events;
//   - MathBro's calculator (brendonmay, serverDiffs.js): the same costs and base rates (× 1.05 with its
//     star catch) and boom drops;
//   - the GMS wiki (Star Force Enhancement): the same costs, boom drops, Safeguard, MVP;
//   - Nexon's v.269 patch notes: modes for 15→21★, level 4 = 0% booms, no level 4 on 15–17★ (the same
//     as Safeguard), Safeguard only with level 1, discounts and the boom reduction apply to the modes;
//     Sunny Sunday: Safeguard's extra isn't discounted, "1+1 Star Force … at 10-Star or below".
// The owner checked the rates in game. The boom reduction covers 21→22★ too (the owner: Nexon's "below
// 21 Stars" is a mistake). Stars are counted from the tap's starting star (15 = the 15→16★ tap).

// Each tap's success and boom chance, from 0★ to 29★ (the rest of a tap keeps the star).
export const STAR_RATES: readonly [success: number, boom: number][] = [
  [0.9975, 0], [0.945, 0], [0.8925, 0], [0.8925, 0], [0.84, 0], [0.7875, 0], [0.735, 0], [0.6825, 0], [0.63, 0], [0.5775, 0],
  [0.525, 0], [0.4725, 0], [0.42, 0], [0.3675, 0], [0.315, 0],
  [0.315, 0.02055], [0.315, 0.02055], [0.1575, 0.0674], [0.1575, 0.0674], [0.1575, 0.08425], [0.315, 0.10275], [0.1575, 0.126375], [0.1575, 0.1685],
  [0.105, 0.179], [0.105, 0.179], [0.105, 0.179], [0.0735, 0.1853], [0.0525, 0.1895], [0.0315, 0.1937], [0.0105, 0.1979],
];

// Enhancement Modes 1–4 on 15→21★ (no Mode 4 on 15–17★: Safeguard is the same): cost ×, success, boom.
export const MODES: Readonly<Record<number, readonly [mult: number, success: number, boom: number][]>> = {
  15: [[1, 0.315, 0.02055], [1.5, 0.315, 0.0137], [2.5, 0.315, 0.00685]],
  16: [[1, 0.315, 0.02055], [1.5, 0.315, 0.0137], [2.5, 0.315, 0.00685]],
  17: [[1, 0.1575, 0.0674], [1.5, 0.1575, 0.042125], [2.5, 0.1575, 0.01685]],
  18: [[1, 0.1575, 0.0674], [2, 0.126, 0.0437], [3.5, 0.105, 0.0179], [6.5, 0.084, 0]],
  19: [[1, 0.1575, 0.08425], [2, 0.126, 0.06118], [3.5, 0.105, 0.0358], [6.5, 0.084, 0]],
  20: [[1, 0.315, 0.10275], [2, 0.2625, 0.07375], [3.5, 0.21, 0.0395], [6.5, 0.1575, 0]],
  21: [[1, 0.1575, 0.126375], [2, 0.126, 0.0874], [3.5, 0.105, 0.04475], [6.5, 0.084, 0]],
};

// Safeguard on 15–17★ (with Mode 1 only): no booms, +200% of the cost, which no discount reduces.
export const SAFEGUARD_STARS = [15, 16, 17];
export const SAFEGUARD_EXTRA = 2;

// One tap's cost before discounts: 100 × round(level³ × (star + 1)^2.7 ÷ divisor + 10) (0–9★: × (star +
// 1) ÷ 2,500), the level rounded down to a multiple of 10; 17, 18, 19 and 21★ have their own divisors.
const DIVISORS: Readonly<Record<number, number>> = { 10: 40000, 11: 22000, 12: 15000, 13: 11000, 14: 7500, 17: 15000, 18: 7000, 19: 4500, 21: 12500 };
export function tapCost(star: number, level: number): number {
  const lv = Math.floor(level / 10) * 10;
  if (star <= 9) return 100 * Math.round((lv ** 3 * (star + 1)) / 2500 + 10);
  return 100 * Math.round((lv ** 3 * (star + 1) ** 2.7) / (DIVISORS[star] ?? 20000) + 10);
}

// Where a boom leaves the item (it's restored from its trace): 12★ from 15–19★, 15★ from 20★, 17★
// from 21–22★, 19★ from 23–25★, 20★ from 26★ up.
export const boomDropTo = (star: number): number => (star < 20 ? 12 : star === 20 ? 15 : star < 23 ? 17 : star < 26 ? 19 : 20);

// MVP's Star Force discount, on taps from 16★ or below (multiplied with the event discount).
export type MvpTier = "none" | "silver" | "gold" | "diamond";
export const MVP_DISCOUNT: Readonly<Record<MvpTier, number>> = { none: 0, silver: 0.03, gold: 0.05, diamond: 0.1 };
export const MVP_UP_TO = 16;

// Star Force events (any combination; Shining Star Force is the first two):
//   thirtyOff: 30% off every tap (not Safeguard's extra); fewerBooms: 30% fewer booms on taps from 21★
//   or below; fiveTenFifteen: the 5, 10 and 15★ taps can't fail; plusOne: a success from 10★ or below
//   adds 2 stars.
export type SfEvent = "thirtyOff" | "fewerBooms" | "fiveTenFifteen" | "plusOne";
export const PLUS_ONE_UP_TO = 10;

// GMS Arcane, Sacred and Grand Sacred symbols: what each level costs, the Force it gives, and the
// symbols a day from each area's quests. Sources (checked 2026-10-23):
//   - Costs: the MapleStory Wiki's symbol pages ("Cost Table" with its formulas). The tables match
//     the formulas for all 194 rows of all 14 symbols (checked with exact fractions; a test checks
//     sample rows from the pages):
//       Arcane, level L → L+1: L² + 11 symbols; 10,000 × floor((L² + 11) × (k + 0.1 × L)) meso
//       Sacred and Grand Sacred: 9L² + 20L symbols; 100,000 × floor((9L² + 20L) × (k − 0.6 × L)) meso
//     with each area's k below.
//   - Force: Arcane 30 at Lv. 1 and +10 a level (220 at Lv. 20); Sacred 10 at Lv. 1 and +10 a level
//     (110 at Lv. 11) (wiki); Grand Sacred also +10 Sacred Force a level (v.270).
//   - Symbols a day (v.271, 9 Sep 2026): Arcane River dailies 40 (Vanishing Journey and Chu Chu
//     Island give 20 until a story quest is done: we assume it's done), Arcane River weekly content
//     80 per clear, up to 3 clears a week (wiki); Cernium 30, Hotel Arcus to Carcion 15, Tallahart
//     and Geardock 15.
//   - Selector coupons: Arcane Symbol Selector Coupons for the Arcane symbols; Sacred Symbol
//     Selector Coupons for the Sacred symbols and Tallahart (v.271); none for Geardock (v.270).
//   - The Vanishing Journey page's "Mentor System" meso discount appears nowhere in GMS's patch
//     notes: treated as not in GMS.
// Re-check after each GMS patch.
export const SYMBOLS_PATCH = "v.271";

export type SymbolKind = "arcane" | "sacred";

export interface SymbolFigure {
  id: string;
  name: string;
  kind: SymbolKind;
  grand: boolean; // a Grand Sacred Symbol (counted with the Sacred ones)
  k: number; // the area's meso factor (see the formulas above)
  daily: number; // symbols from its daily quest
  weeklyPerClear: number | null; // symbols per weekly clear (Arcane only), up to 3 clears a week
  maxLevel: number;
  selector: SymbolKind | null; // which selector coupon can give it
}

const arcane = (id: string, name: string, k: number): SymbolFigure => ({ id, name, kind: "arcane", grand: false, k, daily: 40, weeklyPerClear: 80, maxLevel: 20, selector: "arcane" });
const sacred = (id: string, name: string, k: number, daily: number, grand = false, selector: SymbolKind | null = "sacred"): SymbolFigure => ({ id, name, kind: "sacred", grand, k, daily, weeklyPerClear: null, maxLevel: 11, selector });

export const SYMBOLS: readonly SymbolFigure[] = [
  arcane("vanishing-journey", "Vanishing Journey", 8),
  arcane("chu-chu-island", "Chu Chu Island", 10),
  arcane("lachelein", "Lachelein", 12),
  arcane("arcana", "Arcana", 14),
  arcane("morass", "Morass", 16),
  arcane("esfera", "Esfera", 18),
  sacred("cernium", "Cernium", 13.2, 30),
  sacred("hotel-arcus", "Hotel Arcus", 15, 15),
  sacred("odium", "Odium", 16.8, 15),
  sacred("shangri-la", "Shangri-La", 18.6, 15),
  sacred("arteria", "Arteria", 20.4, 15),
  sacred("carcion", "Carcion", 22.2, 15),
  sacred("tallahart", "Tallahart", 39.8, 15, true),
  sacred("geardock", "Geardock", 48.8, 15, true, null),
];

export const findSymbol = (id: string): SymbolFigure | undefined => SYMBOLS.find((s) => s.id === id);

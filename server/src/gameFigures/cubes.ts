import type { CubeTable } from "./potential";

// The cubes Heroic worlds buy with meso (the Potential page, v2.3.0). Read 2026-10-28.
// - Which cubes and their prices: the Heroic Cube Shop (the wiki's Cube, Glowing Cube and Bright Cube
//   pages; Nexon's v.239 notes, Feb 2023): Glowing 12m, its new lines replace the old (the old Red
//   Cube's place); Bright 22m, you choose the old or new lines (the old Black Cube's place). Both reach
//   Legendary and can rank an item up.
// - Their lines: Nexon Korea's red and black cube tables (potential-lines.json). Nexon publishes no GMS
//   rates.
// - Rank-ups (Rare→Epic, Epic→Unique, Unique→Legendary): the community spreadsheet "[Post-Reboot]
//   Cubing rates v170+", as brendonmay's and mapledoro's cubing calculators use them; higher than
//   Korea's, which the owner chose not to use. One rank at a time (no known rate for double rank-ups).
// - Events: Double Miracle Time doubles the rank-up chances (brendonmay); a cube sale is 25% off
//   (Nexon's Heroic cube sales of 14–16 Mar and 9–11 May 2026: ×30 for 270m / 495m instead of
//   360m / 660m).

export type Cube = "glowing" | "bright";
export const CUBES: readonly Cube[] = ["glowing", "bright"];
export const CUBE_TABLE: Record<Cube, CubeTable> = { glowing: "red", bright: "black" };
export const CUBE_PRICE: Record<Cube, number> = { glowing: 12_000_000, bright: 22_000_000 };
export const RANK_UP: Record<Cube, readonly [number, number, number]> = { glowing: [0.14, 0.06, 0.025], bright: [0.17, 0.11, 0.05] };
export const SALE = 0.75;
export const MIRACLE = 2;

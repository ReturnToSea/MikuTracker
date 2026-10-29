import type { CUBE_EVENTS, SF_EVENTS } from "@miku/shared";
import type { Cube } from "../gameFigures/cubes";
import { flamesBoard } from "./flames";
import { potentialBoard } from "./potential";
import { starForceBoard } from "./starForce";

// The Upgrades page (v2.4.0): each item's next step in each system, exactly as the Flames, Star Force
// and Potential pages work it out, in one list, cheapest per 1% final damage first. No maths of its own:
// it only turns each page's figures into the same kind of row. Each row's cost is the whole step (the
// owner): Flames and Potential the meso to any better roll, Star Force the best jump with its booms.

export type UpgradeSystem = "flames" | "starforce" | "potential";

export interface UpgradeStep {
  system: UpgradeSystem;
  slot: string;
  name: string;
  icon: string | null;
  step: string; // "Black Flame", "17→18★", "Glowing Cube"
  perFd: number; // meso per 1% final damage
  cost: number; // the whole step, on average
  fd: number; // the final damage it adds, % (on average, when it's reached)
  chance: number; // the next try's chance: of a better flame or roll; of the next star
  boom: number | null; // Star Force: the next tap's boom chance
  // what the item is now: its flame score and best, its stars and boom price, its rank and the other cube's cost
  now: { score: number; best: number } | { star: number; boomCost: number } | { rank: string | null; cube: Cube; otherPerFd: number | null };
}

export interface UpgradesBoard {
  known: boolean; // false: a job the list doesn't know yet
  blackFlamePrice: number;
  mvp: string;
  prices: Record<Cube, number>; // a cube's price with the events on
  steps: UpgradeStep[]; // cheapest per 1% final damage first; a step that adds nothing isn't listed
}

const CUBE_NAME: Record<Cube, string> = { glowing: "Glowing Cube", bright: "Bright Cube" };

export async function upgradesBoard(ownerId: string, characterId: number, sf: (typeof SF_EVENTS)[number][], cubes: (typeof CUBE_EVENTS)[number][]): Promise<UpgradesBoard> {
  // (no budget: the pages' Targets aren't part of this list)
  const [flames, stars, potential] = await Promise.all([flamesBoard(ownerId, characterId, 0), starForceBoard(ownerId, characterId, sf, 0), potentialBoard(ownerId, characterId, cubes, 0)]);
  const head = { blackFlamePrice: flames.price, mvp: stars.mvp, prices: potential.prices };
  if (!flames.known) return { known: false, ...head, steps: [] };
  const steps: UpgradeStep[] = [];
  for (const it of flames.items) {
    const m = it.metrics;
    if (m.mesoPerFd === null) continue;
    steps.push({ system: "flames", slot: it.slot, name: it.name, icon: it.icon, step: "Black Flame", perFd: m.mesoPerFd, cost: m.mesoToBetter!, fd: m.fdIfBetter!, chance: m.better, boom: null, now: { score: it.score, best: it.best } });
  }
  for (const it of stars.items) {
    const j = it.best;
    if (j.perFd === null) continue;
    steps.push({ system: "starforce", slot: it.slot, name: it.name, icon: it.icon, step: `${j.from}→${j.to}★`, perFd: j.perFd, cost: j.cost, fd: j.fd, chance: it.next.success, boom: it.next.boom, now: { star: it.star, boomCost: it.boomCost } });
  }
  for (const it of potential.items) {
    if (it.cheaper === null) continue;
    const m = it.cubes[it.cheaper];
    const other = it.cubes[it.cheaper === "glowing" ? "bright" : "glowing"];
    steps.push({ system: "potential", slot: it.slot, name: it.name, icon: it.icon, step: CUBE_NAME[it.cheaper], perFd: m.mesoPerFd!, cost: m.mesoToBetter!, fd: m.fdIfBetter!, chance: m.better, boom: null, now: { rank: it.rank, cube: it.cheaper, otherPerFd: other.mesoPerFd } });
  }
  // Stryker disable next-line ArrayCallback: see the order's test (cheapest first)
  steps.sort((a, b) => a.perFd - b.perFd);
  return { known: true, ...head, steps };
}

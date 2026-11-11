import type { HexaNode } from "@miku/shared";

// Jobs the HEXA page has no damage figures for yet (MapleScouter's, through mapledoro, don't have them), with
// a fixed order instead: written by hand, kept here until the figures arrive (then the job joins
// hexa-jobs.json, its order worked out as every other job's, and this goes).
//
// Lethe (GMS v.272, 2026-11-11; v4.2.0). Names: Nexon's own, in v.272's game data (mapledoro's
// manifests/v272/hexa-skill.json), "HEXA" dropped from the front as for the other jobs; the Masteries and
// Boosts in its IDs' order, which is MapleScouter's icons' order too (Lethe_2, 7, 8, 9 the Masteries;
// Lethe_3–6 the Boosts; checked against the Discord's picture). Its order: the Lethe Discord's (the owner's
// picture and text, 2026-11-10, tempdata/v42/lethe/), two slips in the text fixed from the picture (step 89
// is Majeure 25, step 115 Void Origin 18), and Void Origin's steps left out: the 3rd Skill node, which GMS
// gets on 2026-12-16. Sol Hecate's first step goes to 2 (the Discord's). ["stat", n]: HEXA Stat n, to rank 20.
export interface FixedHexaJob {
  names: { origin: string; ascent: string; mastery: string[]; boost: string[]; common3: string };
  icons: string; // MapleScouter's name for the job's pictures (<icons>_<n>.png)
  order: readonly (readonly [Exclude<HexaNode, "janus"> | "stat", number])[];
  source: string;
}

export const FIXED_HEXA: Readonly<Record<string, FixedHexaJob>> = {
  Lethe: {
    names: {
      origin: "Dominus: Eye of Eternity",
      ascent: "Sovereign Everlasting",
      mastery: ["Assize / Edict: Fel Storm", "Beckon: Vargr / Edict: Rampage", "Beckon: Dread Knight / Edict: Dread Advance", "Majeure / Oath Incarnate"],
      boost: ["Dominus: Dread Onslaught", "Dominus: Pack United", "Dominus: Azrath", "Chains of Command"],
      common3: "Demonic Wrath",
    },
    icons: "Lethe",
    // prettier-ignore
    order: [
      ["mastery4", 1], ["mastery3", 4], ["boost4", 1], ["mastery3", 5], ["mastery1", 4], ["mastery2", 3], ["mastery3", 6], ["mastery2", 4],
      ["mastery1", 5], ["mastery3", 7], ["common3", 1], ["mastery1", 6], ["mastery3", 8], ["mastery2", 5], ["mastery4", 2], ["stat", 1],
      ["mastery2", 6], ["mastery1", 7], ["mastery3", 9], ["mastery1", 8], ["mastery4", 3], ["mastery2", 7], ["mastery1", 9], ["mastery2", 8],
      ["mastery4", 4], ["mastery2", 9], ["mastery4", 5], ["stat", 2], ["mastery4", 7], ["mastery3", 14], ["stat", 3], ["mastery3", 15],
      ["mastery4", 8], ["mastery3", 16], ["mastery4", 9], ["mastery1", 14], ["mastery3", 17], ["mastery1", 15], ["mastery3", 18], ["mastery2", 14],
      ["ascent", 1], ["mastery1", 16], ["mastery2", 15], ["mastery3", 19], ["mastery1", 17], ["boost1", 1], ["mastery2", 16], ["mastery1", 18],
      ["mastery2", 17], ["boost3", 1], ["boost4", 6], ["mastery1", 19], ["mastery2", 18], ["boost2", 1], ["mastery2", 19], ["mastery3", 26],
      ["origin", 2], ["mastery3", 27], ["mastery4", 15], ["mastery3", 29], ["mastery1", 26], ["mastery4", 16], ["origin", 3], ["hecate", 2],
      ["mastery1", 27], ["ascent", 2], ["mastery4", 17], ["mastery2", 25], ["mastery1", 29], ["mastery2", 26], ["origin", 4], ["mastery2", 27],
      ["mastery4", 18], ["hecate", 3], ["ascent", 3], ["mastery2", 29], ["mastery4", 19], ["origin", 5], ["hecate", 4], ["ascent", 4],
      ["boost4", 12], ["origin", 6], ["hecate", 5], ["origin", 7], ["ascent", 5], ["mastery4", 25], ["hecate", 6], ["mastery4", 26],
      ["origin", 8], ["ascent", 6], ["mastery4", 27], ["origin", 9], ["hecate", 7], ["mastery4", 29], ["mastery3", 30], ["ascent", 7],
      ["hecate", 8], ["ascent", 8], ["common3", 2], ["boost1", 2], ["hecate", 9], ["mastery1", 30], ["boost4", 18], ["ascent", 9],
      ["boost3", 2], ["boost1", 3], ["mastery2", 30], ["common3", 3], ["boost2", 2], ["boost1", 4], ["boost3", 3], ["common3", 4],
      ["boost1", 10], ["boost2", 3], ["boost3", 4], ["boost4", 24], ["origin", 14], ["boost3", 10], ["boost2", 4], ["origin", 15],
      ["common3", 5], ["boost4", 30], ["boost2", 10], ["origin", 16], ["common3", 6], ["hecate", 15], ["mastery4", 30], ["origin", 17],
      ["ascent", 14], ["origin", 18], ["ascent", 15], ["common3", 7], ["ascent", 16], ["common3", 8], ["hecate", 16], ["ascent", 17],
      ["hecate", 30], ["common3", 9], ["ascent", 18], ["boost1", 11], ["ascent", 19], ["boost3", 11], ["boost1", 12], ["boost2", 11],
      ["boost1", 20], ["boost3", 12], ["origin", 30], ["boost3", 20], ["boost2", 12], ["ascent", 26], ["boost2", 20], ["ascent", 27],
      ["boost1", 30], ["ascent", 29], ["common3", 14], ["boost3", 30], ["common3", 16], ["boost2", 30], ["common3", 26], ["ascent", 30],
      ["common3", 30],
    ],
    source: "The Lethe Discord's order (no damage figures for Lethe yet)",
  },
};

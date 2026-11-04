import { STAT_BUFFS_MAGIC, STAT_BUFFS_PHYSICAL, type StatsInput } from "@miku/shared";

// The Stats page's display rules (v4.0.0), as plain functions.

// The buffs' GMS names (chablades/mapledoro's), the guild skills', Champion's Renown's and the links'.
export const BUFF_NAMES: Readonly<Record<string, string>> = {
  candiedApple: "Candied Apple", sayramElixir: "Sayram's Elixir", collectorElixir: "Collector's Elixir", honorableElixir: "Honorable Elixir", extremePotion: "Extreme Potion",
  sparklingRedStar: "Sparkling Red Star Potion", brightMoonlight: "Bright Moonlight Potion", heroEcho: "Hero's Echo", legionMight: "Legion's Might", masarayuGift: "Masarayu's Gift",
  caretakerSupport: "Caretaker's Support", vipBuff: "VIP Buff (Stats)", mvpSuperpower: "MVP Superpower Buff", genepass: "Power of the Adversary", enlightenedOne: "The Enlightened One",
  sparklingBlueStar: "Sparkling Blue Star Potion", greatHeroBoost: "Advanced Great Hero Boost Potion", legendaryHero: "Legendary Hero Potion", advWeaponTempering: "Advanced Weapon Tempering",
  tengusJudgement: "Tengu's Judgement", attackPotionV: "Advanced Attack Potion V", magicPotionV: "Advanced Magic Potion V", onyxApple: "Onyx Apple", energizerDrink: "The Energizer Drink",
  energizerDrinkMagic: "The Energizer Drink", fishBuff: "Tree Ornament", witchStew: "Witch's Special Stew", ssiwsCheese: "Ssiws Cheese",
  believeInYourself: "Believe in Yourself", gourmandPower: "Gourmand Power", peerlessMarble: "Peerless Marble",
  sacredSymbols: "Sacred symbols",
  statPotionSTR: "Advanced Stat Potion X", statPotionDEX: "Advanced Stat Potion X", statPotionINT: "Advanced Stat Potion X", statPotionLUK: "Advanced Stat Potion X", statPotionHP: "Advanced Stat Potion X",
};
export const GUILD_NAMES: Readonly<Record<keyof StatsInput["guild"], string>> = { bossSlayers: "Boss Slayers", forTheGuild: "For the Guild!", hardHitter: "Hard Hitter", undeterred: "Undeterred" };
export const RENOWN_NAMES: Readonly<Record<keyof StatsInput["renown"], string>> = { allStat: "Renown: All Stats", atk: "Renown: ATT", boss: "Renown: Boss DMG", ied: "Renown: IED", critDmg: "Renown: Crit DMG" };
export const LINK_NAMES: Readonly<Record<keyof StatsInput["links"], string>> = {
  thief: "Thief's Cunning", magician: "Empirical Knowledge", kadena: "Unfair Advantage", illium: "Tide of Battle", ark: "Solus", kain: "Time to Prepare", angel: "Terms and Conditions", kanna: "Elementalism", mukhyun: "Qi Cultivation", hoyoung: "Bravado",
};
// A buff's picture's id: the Magic ATT Energizer Drink shares the other's.
export const iconId = (buff: string): string => (buff === "energizerDrinkMagic" ? "energizerDrink" : buff);

// Whether a job sees a group B buff: some are only for jobs that use Magic ATT, some only for the others.
export const shownFor = (buff: string, magic: boolean): boolean => (STAT_BUFFS_MAGIC.includes(buff) ? magic : STAT_BUFFS_PHYSICAL.includes(buff) ? !magic : true);

// A whole number grouped (272,801,300); a score not worked out: "—".
export const formatWhole = (n: number | null): string => (n === null ? "—" : Math.round(n).toLocaleString("en-US"));
// Final Damage as MapleScouter shows it: two decimals (139.35).
export const formatPct = (n: number): string => n.toFixed(2);

// The input with one number changed, at a path like "stats.main.base" or "wildHunter".
export function withValue(input: StatsInput, path: string, value: number): StatsInput {
  const out = structuredClone(input) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let at = out;
  for (const k of keys.slice(0, -1)) at = at[k] as Record<string, unknown>;
  at[keys.at(-1)!] = value;
  return out as unknown as StatsInput;
}
// A group's pick: picking the one already picked takes it off (only one counts).
export function withPick(input: StatsInput, group: "buffA" | "buffB", buff: string): StatsInput {
  return { ...input, [group]: input[group] === buff ? null : buff };
}

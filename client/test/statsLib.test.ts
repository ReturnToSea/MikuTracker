import { STATS_DEFAULTS, STAT_BUFFS, STAT_BUFFS_A, STAT_BUFFS_B, STAT_EVENT_BUFFS, STAT_LINKS } from "@miku/shared";
import { describe, expect, it } from "vitest";
import { BUFF_NAMES, formatPct, formatWhole, GUILD_NAMES, iconId, LINK_NAMES, RENOWN_NAMES, shownFor, withPick, withValue } from "../src/lib/stats";

describe("names", () => {
  it("every buff has its GMS name; every link its skill's", () => {
    for (const k of [...STAT_BUFFS, ...STAT_BUFFS_A, ...STAT_BUFFS_B, ...STAT_EVENT_BUFFS]) expect(BUFF_NAMES[k], k).toBeTruthy();
    expect(Object.keys(LINK_NAMES).sort()).toEqual(Object.keys(STAT_LINKS).sort());
    expect([BUFF_NAMES.sayramElixir, BUFF_NAMES.fishBuff, BUFF_NAMES.energizerDrinkMagic, LINK_NAMES.kadena, LINK_NAMES.thief]).toEqual(["Sayram's Elixir", "Tree Ornament", "The Energizer Drink", "Unfair Advantage", "Thief's Cunning"]);
  });
  it("each name, as the game words it", () => {
    expect(LINK_NAMES).toEqual({ thief: "Thief's Cunning", magician: "Empirical Knowledge", kadena: "Unfair Advantage", illium: "Tide of Battle", ark: "Solus", kain: "Time to Prepare", angel: "Terms and Conditions", kanna: "Elementalism", mukhyun: "Qi Cultivation", hoyoung: "Bravado" });
    expect(RENOWN_NAMES).toEqual({ allStat: "Renown: All Stats", atk: "Renown: ATT", boss: "Renown: Boss DMG", ied: "Renown: IED", critDmg: "Renown: Crit DMG" });
    expect(GUILD_NAMES).toEqual({ bossSlayers: "Boss Slayers", forTheGuild: "For the Guild!", hardHitter: "Hard Hitter", undeterred: "Undeterred" });
    expect(BUFF_NAMES).toEqual({
      candiedApple: "Candied Apple", sayramElixir: "Sayram's Elixir", collectorElixir: "Collector's Elixir", honorableElixir: "Honorable Elixir", extremePotion: "Extreme Potion",
      sparklingRedStar: "Sparkling Red Star Potion", brightMoonlight: "Bright Moonlight Potion", heroEcho: "Hero's Echo", legionMight: "Legion's Might", masarayuGift: "Masarayu's Gift",
      caretakerSupport: "Caretaker's Support", vipBuff: "VIP Buff (Stats)", mvpSuperpower: "MVP Superpower Buff", genepass: "Power of the Adversary", enlightenedOne: "The Enlightened One",
      sparklingBlueStar: "Sparkling Blue Star Potion", greatHeroBoost: "Advanced Great Hero Boost Potion", legendaryHero: "Legendary Hero Potion", advWeaponTempering: "Advanced Weapon Tempering",
      tengusJudgement: "Tengu's Judgement", attackPotionV: "Advanced Attack Potion V", magicPotionV: "Advanced Magic Potion V", onyxApple: "Onyx Apple", energizerDrink: "The Energizer Drink",
      energizerDrinkMagic: "The Energizer Drink", fishBuff: "Tree Ornament", witchStew: "Witch's Special Stew", ssiwsCheese: "Ssiws Cheese",
      believeInYourself: "Believe in Yourself", gourmandPower: "Gourmand Power", peerlessMarble: "Peerless Marble",
      sacredSymbols: "Sacred symbols",
      statPotionSTR: "Advanced Stat Potion X", statPotionDEX: "Advanced Stat Potion X", statPotionINT: "Advanced Stat Potion X", statPotionLUK: "Advanced Stat Potion X", statPotionHP: "Advanced Stat Potion X",
    });
  });
  it("the Magic ATT Energizer Drink shows the other's picture; the rest their own", () => {
    expect([iconId("energizerDrinkMagic"), iconId("energizerDrink"), iconId("sayramElixir")]).toEqual(["energizerDrink", "energizerDrink", "sayramElixir"]);
  });
});

describe("shownFor", () => {
  it("a magic job sees the Magic ATT foods, the others the ATT ones; the rest everyone", () => {
    expect(["magicPotionV", "energizerDrinkMagic", "ssiwsCheese"].map((k) => [shownFor(k, true), shownFor(k, false)])).toEqual([[true, false], [true, false], [true, false]]);
    expect(["attackPotionV", "energizerDrink"].map((k) => [shownFor(k, true), shownFor(k, false)])).toEqual([[false, true], [false, true]]);
    expect([shownFor("onyxApple", true), shownFor("onyxApple", false)]).toEqual([true, true]);
  });
});

describe("formatting", () => {
  it("whole numbers grouped; none: —; Final Damage to 2 decimals", () => {
    expect([formatWhole(272_801_300), formatWhole(87_582.4), formatWhole(null), formatWhole(0)]).toEqual(["272,801,300", "87,582", "—", "0"]);
    expect([formatPct(139.3523), formatPct(93.28782), formatPct(0)]).toEqual(["139.35", "93.29", "0.00"]);
  });
});

describe("changing the input", () => {
  it("a number at a path, the rest as it was (the input itself untouched)", () => {
    const a = withValue(STATS_DEFAULTS, "stats.main.base", 7812);
    expect(a.stats.main).toEqual({ base: 7812, per: 0, abs: 0 });
    expect(a.stats.sub).toEqual(STATS_DEFAULTS.stats.sub);
    expect(STATS_DEFAULTS.stats.main.base).toBe(0);
    expect(withValue(STATS_DEFAULTS, "wildHunter", 212).wildHunter).toBe(212);
    expect(withValue(STATS_DEFAULTS, "links.kain", 3).links).toEqual({ ...STATS_DEFAULTS.links, kain: 3 });
  });
  it("a group's pick: picked; picking another swaps it; picking it again takes it off; the other group untouched", () => {
    const a = withPick(STATS_DEFAULTS, "buffA", "legendaryHero");
    expect([a.buffA, a.buffB]).toEqual(["legendaryHero", null]);
    expect(withPick(a, "buffA", "greatHeroBoost").buffA).toBe("greatHeroBoost");
    expect(withPick(a, "buffA", "legendaryHero").buffA).toBeNull();
    expect(withPick(a, "buffB", "onyxApple")).toMatchObject({ buffA: "legendaryHero", buffB: "onyxApple" });
  });
});

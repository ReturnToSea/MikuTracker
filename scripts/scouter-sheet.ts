// By hand (scripts only, never the app): a MapleScouter sheet (the userStat its page sends) as our Stats input,
// and the context our formula needs for it. Used by scripts/class-data.mjs (v4.6.0).
import { HEXA_NODES, STAT_BUFFS, STAT_BUFFS_A, STAT_BUFFS_B, STATS_DEFAULTS, statsInput } from "../shared/src/index.ts";
import { coreAttAt } from "../server/src/calc/hexa.ts";
import { hexaDamage } from "../server/src/calc/hexaDamage.ts";
import { CORE_OF, hexaJob } from "../server/src/gameFigures/hexa.ts";
import { BUFF_KEY } from "../server/src/gameFigures/stats.ts";

// MapleScouter's class names (its class list, 2026-11-18) → the names Nexon's rankings use.
export const JOB: Record<string, string> = {
  나이트로드: "Night Lord", 나이트워커: "Night Walker", 다크나이트: "Dark Knight", 데몬슬레이어: "Demon Slayer", 데몬어벤져: "Demon Avenger",
  듀얼블레이드: "Dual Blade", 라라: "Lara", 레테: "Lethe", 렌: "Ren", 루미너스: "Luminous", 메르세데스: "Mercedes", 메카닉: "Mechanic", 미하일: "Mihile",
  바이퍼: "Buccaneer", 배틀메이지: "Battle Mage", 보우마스터: "Bow Master", 블래스터: "Blaster", 비숍: "Bishop", 섀도어: "Shadower", 소울마스터: "Dawn Warrior",
  스트라이커: "Thunder Breaker", 신궁: "Marksman", 아델: "Adele", 아란: "Aran", 아크: "Ark", "아크메이지(불,독)": "Arch Mage Fire/Poison",
  "아크메이지(썬,콜)": "Arch Mage Ice/Lightning", 에반: "Evan", 엔젤릭버스터: "Angelic Buster", 와일드헌터: "Wild Hunter", 윈드브레이커: "Wind Archer",
  은월: "Shade", 일리움: "Illium", 제논: "Xenon", 제로: "Zero", 카데나: "Cadena", 카이저: "Kaiser", 카인: "Kain", 칼리: "Khali", 캐논슈터: "Cannoneer",
  캡틴: "Corsair", 키네시스: "Kinesis", 팔라딘: "Paladin", 패스파인더: "Pathfinder", 팬텀: "Phantom", 플레임위자드: "Blaze Wizard", 호영: "Hoyoung",
  히어로: "Hero", 하야토: "Hayato", 묵현: "Mo Xuan", 린: "Lynn", 칸나: "Kanna", 시아: "Sia Astelle", 에렐: "Erel Light",
};
const n = (x: unknown) => Number(x) || 0;

// The sheet as our input, its job, and the context (HEXA from the sheet's core levels). Throws on a class we don't
// know, or on an input our rules refuse.
export function fromSheet(u: any) {
  const s = u.stat, dp = u.doping, sp = u.special;
  const pick = (ids: readonly string[]) => ids.find((id) => dp[BUFF_KEY[id]!] === true) ?? null;
  const parsed = statsInput.safeParse({
    ...structuredClone(STATS_DEFAULTS),
    stats: {
      main: { base: n(s.mainStatBase), per: n(s.mainStatPer), abs: n(s.mainStatAbs) }, sub: { base: n(s.subStatBase), per: n(s.subStatPer), abs: n(s.subStatAbs) },
      third: { base: n(s.ssubStatBase), per: n(s.ssubStatPer), abs: n(s.ssubStatAbs) }, atk: { base: n(s.atkBase), per: n(s.atkPercent), abs: n(s.atkAbs) },
      dmg: n(s.dmg), boss: n(s.bossDmg), ied: n(s.ignoreDef), critRate: n(s.critical), critDmg: n(s.criticalDmg), cdSec: n(s.coolTimeReduce), cdPct: n(s.coolTimeReducePercent), cdSkip: n(s.resetCoolDown),
      buffDuration: n(s.buffDuration), statusDmg: n(s.statusAdditionalDmg), elemResist: n(s.ignoreElementalResist), summon: n(s.summonPersistTime), arcane: n(s.arcaneForce), sacred: n(s.authenticForce),
    },
    liberation: sp.genesis === true, ruinShield: sp.useRuinForceShild === true, oneHanded: sp.oneHandSword === true,
    buffs: Object.fromEntries(STAT_BUFFS.map((b) => [b, dp[BUFF_KEY[b]!] === true])),
    buffA: pick(STAT_BUFFS_A), buffB: pick(STAT_BUFFS_B), statPotion: dp.statPotion === true && n(dp.stat) > 0,
    guild: { bossSlayers: dp.noblessBoss ? n(dp.nobless[0]) : 0, forTheGuild: dp.noblessDmg ? n(dp.nobless[1]) : 0, hardHitter: dp.noblessCriDmg ? n(dp.nobless[2]) : 0, undeterred: dp.noblessIgnore ? n(dp.nobless[3]) : 0 },
    renown: { allStat: n(dp.championAll), atk: n(dp.championAtk), boss: n(dp.championBoss), ied: n(dp.championIgnore), critDmg: n(dp.championCriDmg) },
    eventOn: false,
    links: Object.fromEntries(Object.keys(STATS_DEFAULTS.links).map((k) => [k, n(u.linkSkill[k])])),
    wildHunter: n(s.wildhunterUnion), artifact: { extraTarget: s.artifact_increaseTarget === true, finalAttack: n(s.artifact_finalAttack) },
    innerAbility: s.passiveSkillLevelUp ? "passive" : s.increaseTarget ? "target" : "none",
    rings: { restraint: n(sp.restraintRing), continuous: n(sp.continuosRing), weapon: n(sp.weaponRing) },
  });
  if (!parsed.success) throw new Error(parsed.error.message);
  const job = JOB[s.myClass];
  if (!job) throw new Error(`no job for ${s.myClass}`);
  const hexa = hexaJob(job);
  if (!hexa) throw new Error(`no HEXA figures for ${job}`);
  const levels = Object.fromEntries(HEXA_NODES.map((k) => [k, 0])) as Record<string, number>;
  for (const [node, core] of Object.entries(CORE_OF)) levels[node] = n(u.hexa[core]);
  const cores = Object.fromEntries(Object.entries(CORE_OF).map(([node, core]) => [core, levels[node]]));
  const ctx = {
    level: n(s.level), heroic: sp.isReboot === true, sacred: dp.authenticDmg === true,
    cores: hexaDamage(hexa.model, cores as any), coreAtt: hexa.att ? coreAttAt(hexa.att.points, levels[hexa.att.node]!) : 0,
  };
  return { job, input: parsed.data, ctx };
}

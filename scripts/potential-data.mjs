// node scripts/potential-data.mjs: turns Nexon Korea's potential tables (downloaded by
// scripts/potential-fetch.mjs into tempdata/nexon-potential/ for the black cube and
// tempdata/nexon-potential-red/ for the red one) into server/src/gameFigures/potential-lines.json: for
// each cube, kind of item, rank and level range, the lines each of the 3 potential lines can roll, with
// their chance, in English. By hand, after a patch. Never part of the app or its tests.
//
// GMS differs from Korea in one known way, applied by the app (server/src/gameFigures/potential.ts):
// items from Lv. 151 get +1% on some lines. Korea's Lv. 201+ tables aren't GMS's, so they're left out.
// Lines it can't translate are listed, never guessed.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const FOLDERS = { black: "nexon-potential", red: "nexon-potential-red" };
const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/potential-lines.json");
const unescape = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");
const text = (html) => unescape(html.replace(/<[^>]+>/g, "")).trim();

// Whole-line translations into GMS's wording. # is a number.
const STATS = { STR: "STR", DEX: "DEX", INT: "INT", LUK: "LUK", "최대 HP": "Max HP", "최대 MP": "Max MP", 공격력: "ATT", 마력: "Magic ATT", 올스탯: "All Stats", 방어력: "DEF", 이동속도: "Speed", 점프력: "Jump", 데미지: "Damage", "크리티컬 확률": "Critical Rate", "크리티컬 데미지": "Critical Damage", "몬스터 방어율 무시": "Ignore Enemy DEF", "보스 몬스터 데미지": "Boss Damage", "메소 획득량": "Mesos Obtained", "아이템 드롭률": "Item Drop Rate" };
const EFFECTS = { 중독효과: "Poison", 기절효과: "Stun", 슬로우효과: "Slow", 암흑효과: "Darkness", 빙결효과: "Freeze", 봉인효과: "Seal" };
const FEELINGS = { "사랑에 빠진다": "fall in love", "격노를 느낀다": "feel rage", "분노를 느낀다": "feel angry", "감동을 느낀다": "feel moved", "행복을 느낀다": "feel happy" };
const SKILLS = { "쓸만한 하이퍼 바디": "Decent Hyper Body", "쓸만한 윈드 부스터": "Decent Speed Infusion", "쓸만한 샤프 아이즈": "Decent Sharp Eyes", "쓸만한 어드밴스드 블레스": "Decent Advanced Blessing", "쓸만한 미스틱 도어": "Decent Mystic Door", "쓸만한 컴뱃 오더스": "Decent Combat Orders", "쓸만한 헤이스트": "Decent Haste", "쓸만한 홀리 심볼": "Decent Holy Symbol" };
const n = "(-?\\d+(?:\\.\\d+)?)";
const RULES = [
  [new RegExp(`^(${Object.keys(STATS).join("|")}) \\+${n}(%?)$`), (m) => `${STATS[m[1]]} +${m[2]}${m[3]}`],
  [new RegExp(`^캐릭터 기준 10레벨 당 (${Object.keys(STATS).join("|")}) \\+${n}(%?)$`), (m) => `${STATS[m[1]]} +${m[2]}${m[3]} per 10 character levels`],
  [new RegExp(`^모든 스킬의 재사용 대기시간 -${n}초(?:\\(10초 이하는 10%감소, 5초 미만으로 감소 불가\\))?$`), (m) => `Skill Cooldown -${m[1]} sec`],
  [new RegExp(`^스킬 재사용 대기시간 -${n}초$`), (m) => `Skill Cooldown -${m[1]} sec`],
  [new RegExp(`^모든 스킬의 MP 소모 -${n}%$`), (m) => `MP Cost of All Skills -${m[1]}%`],
  [new RegExp(`^HP 회복 아이템 및 회복 스킬 효율 \\+${n}%$`), (m) => `HP Recovery Items and Skills +${m[1]}%`],
  [new RegExp(`^<(${Object.keys(SKILLS).join("|")})> 스킬 사용 가능$`), (m) => `Enables <${SKILLS[m[1]]}>`],
  [new RegExp(`^피격 시 ${n}% 확률로 데미지의 ${n}% 무시$`), (m) => `${m[1]}% chance to ignore ${m[2]}% damage when hit`],
  [new RegExp(`^피격 시 ${n}% 확률로 ${n}초간 무적$`), (m) => `${m[1]}% chance to become invincible for ${m[2]} sec when hit`],
  [new RegExp(`^피격 후 무적시간 \\+${n}초$`), (m) => `Invincibility after being hit +${m[1]} sec`],
  [new RegExp(`^피격 시 ${n}% 확률로 ${n}초간 (${Object.keys(FEELINGS).join("|")})$`), (m) => `${m[1]}% chance to ${FEELINGS[m[3]]} for ${m[2]} sec when hit`],
  [new RegExp(`^공격 시 ${n}% 확률로 ${n}의 (HP|MP) 회복$`), (m) => `${m[1]}% chance to recover ${m[2]} ${m[3]} when attacking`],
  [new RegExp(`^몬스터 처치 시 ${n}% 확률로 ${n}의 (HP|MP) 회복$`), (m) => `${m[1]}% chance to recover ${m[2]} ${m[3]} when you kill a monster`],
  [new RegExp(`^4초 당 ${n}의 (HP|MP) 회복$`), (m) => `Recover ${m[1]} ${m[2]} every 4 sec`],
  [new RegExp(`^공격 시 ${n}% 확률로 ${n}레벨 (${Object.keys(EFFECTS).join("|")}) 적용$`), (m) => `${m[1]}% chance to apply Lv. ${m[2]} ${EFFECTS[m[3]]} when attacking`],
  [new RegExp(`^피격 시 ${n}% 확률로 받은 피해의 ${n}%를 반사$`), (m) => `${m[1]}% chance to reflect ${m[2]}% of damage taken when hit`],
  [new RegExp(`^받은 피해의 ${n}%를 반사$`), (m) => `Reflect ${m[1]}% of damage taken`],
  [new RegExp(`^${n}% 확률로 받은 피해의 ${n}%를 반사$`), (m) => `${m[1]}% chance to reflect ${m[2]}% of damage taken`],
  [new RegExp(`^${n}% 확률로 오토스틸$`), (m) => `${m[1]}% chance to Auto Steal`],
];
const untranslated = new Map();
function translate(korean) {
  for (const [re, f] of RULES) {
    const m = re.exec(korean);
    if (m) return f(m);
  }
  untranslated.set(korean.replace(/\d+(\.\d+)?/g, "#"), korean);
  return null;
}

// tempdata file names: <part>_<rank>_<level>.html (the part's spaces as "-")
// Each line once; the tables refer to it by number. Chances as whole numbers of 1/10,000 %.
const lineList = [];
const lineIndex = new Map();
const ref = (line) => {
  if (!lineIndex.has(line)) {
    lineIndex.set(line, lineList.length);
    lineList.push(line);
  }
  return lineIndex.get(line);
};
const tableList = [];
const tableIndex = new Map();
const data = { black: {}, red: {} };
let files = 0;
for (const [cube, folder] of Object.entries(FOLDERS)) for (const file of readdirSync(path.resolve(import.meta.dirname, "../tempdata", folder)).filter((f) => f.endsWith(".html"))) {
  const [part, rank, level] = file.replace(/\.html$/, "").split("_");
  if (level === "201") continue;
  const html = readFileSync(path.resolve(import.meta.dirname, "../tempdata", folder, file), "utf8");
  const tables = [...html.matchAll(/<table class="cube_data[^"]*">([\s\S]*?)<\/table>/g)].map((t) => t[1]);
  if (tables.length !== 3) continue;
  const positions = tables.map((t) => {
    const cells = [...t.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1]));
    const lines = [];
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const line = translate(cells[i]);
      if (line) lines.push([ref(line), Math.round(Number(cells[i + 1].replace("%", "")) * 10000)]);
    }
    return lines;
  });
  // each distinct line's options once; the parts refer to them by number
  const key = JSON.stringify(positions);
  if (!tableIndex.has(key)) {
    tableIndex.set(key, tableList.length);
    tableList.push(positions);
  }
  ((data[cube][part.replace("-", " ")] ??= {})[level] ??= {})[rank] = tableIndex.get(key);
  files += 1;
}
writeFileSync(OUT, `${JSON.stringify({ source: "Nexon Korea's official potential tables (maplestory.nexon.com/Guide/OtherProbability/cube/black and /red), read by hand with scripts/potential-fetch.mjs", read: new Date().toISOString().slice(0, 10), levels: "the lowest level of each of Nexon's level ranges: 0 (0–9), 10, 11 (11–19), 20, 21 (21–29), …, 110, 111 (111–119), 120 (120 and up)", chances: "1/10,000 %", lines: lineList, tables: tableList, cubes: data })}\n`);
console.log(`${files} tables → ${OUT}`);
console.log(untranslated.size ? `Not translated (left out):\n- ${[...untranslated.values()].join("\n- ")}` : "Every line translated.");

// A fake Nexon for the QA copy (npm run qa -- --fake-nexon, and npm run qa:check): made-up
// characters, answering rankings the way the real Nexon was seen to (test/fixtures/nexon.ts),
// and their avatars as real little pictures, all on this Mac. So hand tests and the click-through
// need no internet, never bother Nexon, and can make a character level up or vanish on purpose.
//   GET  /ranking?type=…&id=…&character_name=…   rankings, as Nexon's address answers them
//   GET  /images/msavatar1.nexon.net/Character/NAME.png   an avatar (NEXON_IMAGES_URL points here)
//   POST /control/set {name, ...changes}   change a character (or add one, with every field)
//   POST /control/remove {name}            it can no longer be found
//   POST /control/reset                    back to the starting characters
import { createServer } from "node:http";
import { crc32, deflateSync } from "node:zlib";
import { answer, CHARACTERS, type FakeCharacter } from "../test/fixtures/nexon";

const PORT = Number(process.env.FAKE_NEXON_PORT ?? 4755);

// The starting characters: the tests' three, plus a level-300 one, one without Legion on Hyperion and a Ren.
const start = (): FakeCharacter[] => [
  ...CHARACTERS.map((c) => ({ ...c, legion: c.legion && { ...c.legion } })),
  { characterName: "MaxedOut", worldID: 45, level: 300, exp: 0, jobName: "Hero", worldRank: 1, overallRank: 3 },
  { characterName: "NewHere", worldID: 70, level: 200, exp: 1_000_000_000, jobName: "Kain", worldRank: 80_000, overallRank: 200_000 },
  // (v3.0.0: a Ren for the HEXA page; the click-through adds it there and removes it after)
  { characterName: "PlumBlade", worldID: 45, level: 275, exp: 0, jobName: "Ren", worldRank: 900, overallRank: 3_000 },
];
let characters = start();

// A 96 × 96 picture in one color picked from the name: a real PNG, so the page can show it.
function avatar(name: string): Buffer {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [r, g, b] = [h & 255, (h >> 8) & 255, (h >> 16) & 255];
  const size = 96;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) row.set([r, g, b], 1 + x * 3);
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: size }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// A control request's JSON body, or null if it isn't JSON.
const body = (req: import("node:http").IncomingMessage) =>
  new Promise<Record<string, unknown> | null>((resolve) => {
    let text = "";
    req.on("data", (c) => (text += c));
    req.on("end", () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve(null);
      }
    });
  });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const send = (status: number, data: unknown, type = "application/json") => {
    res.writeHead(status, { "Content-Type": type });
    res.end(type === "application/json" ? JSON.stringify(data) : (data as Buffer));
  };
  if (req.method === "GET" && url.pathname === "/ranking") {
    const reply = answer(`https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na${url.search}`, characters);
    return send(reply.status, await reply.json());
  }
  const pic = /^\/images\/msavatar1\.nexon\.net\/Character\/(\w+)\.png$/.exec(url.pathname);
  if (req.method === "GET" && pic) return send(200, avatar(pic[1]!), "image/png");
  const named = async () => {
    const b = await body(req);
    return b && typeof b.name === "string" ? (b as { name: string } & Partial<FakeCharacter>) : null;
  };
  if (req.method === "POST" && url.pathname === "/control/set") {
    const request = await named();
    if (!request) return send(400, { error: "Send JSON with a name" });
    const { name, ...changes } = request;
    const found = characters.find((c) => c.characterName.toLowerCase() === name.toLowerCase());
    if (found) Object.assign(found, changes);
    else characters.push({ characterName: name, ...changes } as FakeCharacter);
    return send(200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/control/remove") {
    const request = await named();
    if (!request) return send(400, { error: "Send JSON with a name" });
    const { name } = request;
    characters = characters.filter((c) => c.characterName.toLowerCase() !== name.toLowerCase());
    return send(200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/control/reset") {
    characters = start();
    return send(200, { ok: true });
  }
  send(404, { error: "Not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`Fake Nexon on http://127.0.0.1:${PORT} (${characters.length} made-up characters)`));

// npm run nexon:check -- <name> [world]
// Looks one character up in Nexon's real rankings, the same way the app does, and prints the
// result. A manual check that Nexon's data still has the shape we expect; tests never run this.
// world: 45 (Kronos, the default) or 70 (Hyperion).
import { worldName } from "@miku/shared";
import { nexon, NexonError } from "../src/nexon";

const [name, world = "45"] = process.argv.slice(2);
if (!name) {
  console.log("Use: npm run nexon:check -- <name> [world: 45 Kronos (default) or 70 Hyperion]");
  process.exit(1);
}
console.log(`Looking up ${name} on ${worldName(Number(world)) ?? `world ${world}`}…`);
try {
  console.log(await nexon().lookUp(name, Number(world)));
} catch (error) {
  if (!(error instanceof NexonError)) throw error;
  console.log(`${error.kind}: ${error.message}`);
  process.exit(2);
}

// npm run refresh: one refresh now, by hand (the server does it every 4 hours by itself).
// For example on the development database: MIKU_DATABASE=dev npm run refresh
import { getConfig } from "../src/config";
import { nexon } from "../src/nexon";
import { refreshAll } from "../src/services/refresh";

console.log(`Refreshing every character in ${getConfig().databaseFile} …`);
const run = await refreshAll(nexon());
if (run) console.log(`Checked ${run.checked}: ${run.updated} updated, ${run.missing} not found, ${run.failed} failed.${run.problem ? ` Problem: ${run.problem}` : ""}`);

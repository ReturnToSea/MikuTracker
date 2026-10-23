// Starts the server: npm run dev and the always-on app run this file.
import { backupPlace, scheduleBackups } from "./backups";
import { getConfig } from "./config";
import { nexon } from "./nexon";
import { startServer } from "./server";
import { scheduleRefresh } from "./services/refresh";

const { host, port, refresh, backups } = getConfig();
await startServer();
// The development copy (npm run dev) leaves backups and refreshing to the always-on app.
if (backups) scheduleBackups(backupPlace());
if (refresh) scheduleRefresh(nexon);
console.log(`MikuTracker running at http://${host === "127.0.0.1" ? "localhost" : host}:${port}`);

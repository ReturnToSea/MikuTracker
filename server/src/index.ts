// Starts the server: npm start, npm run dev, and the always-on app all run this file.
import { getConfig } from "./config";
import { nexon } from "./nexon";
import { startServer } from "./server";
import { scheduleRefresh } from "./services/refresh";

const { host, port, refresh } = getConfig();
await startServer();
// The development copy (npm run dev) leaves refreshing to the always-on app.
if (refresh) scheduleRefresh(nexon);
console.log(`MikuTracker running at http://${host === "127.0.0.1" ? "localhost" : host}:${port}`);

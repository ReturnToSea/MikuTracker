// Starts the server: npm start, npm run dev, and the always-on app all run this file.
import { getConfig } from "./config";
import { startServer } from "./server";

const { host, port } = getConfig();
await startServer();
console.log(`MikuTracker running at http://${host === "127.0.0.1" ? "localhost" : host}:${port}`);

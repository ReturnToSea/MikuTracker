import type { Server } from "node:http";
import { createApp } from "./app";
import { getConfig } from "./config";

// Starts the app on the configured address and port (127.0.0.1:4750 unless settings say otherwise).
export function startServer(options: { host: string; port: number } = getConfig(), app = createApp()): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(options.port, options.host);
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

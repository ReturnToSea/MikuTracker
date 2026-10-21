import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll } from "vitest";
import { createApp } from "../src/app";

// A fresh app and server for each request, bound explicitly to 127.0.0.1. (In Goal Tracker,
// letting supertest start its own server per request bound every address on a random port, and
// requests sometimes went to another program on this Mac instead.) Fresh per request so each test
// really runs createApp: mutation testing then checks the app's setup against every test, not
// only the first one in the file. All servers close when the file's tests finish.
// No React app is served (a folder that doesn't exist), so results don't depend on whether
// client/dist happens to be built; static.test.ts covers serving the app.
export const NO_CLIENT = path.join(os.tmpdir(), "miku-tracker-no-client");
const servers: Server[] = [];
export function api() {
  const server = createApp({ clientDist: NO_CLIENT }).listen(0, "127.0.0.1");
  servers.push(server);
  return request(server);
}
afterAll(() => Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve())))));

// Wraps setup requests so a failed setup stops the test with a clear message instead of causing
// a confusing failure (or a false pass) later on.
export async function ok(req: request.Test) {
  const res = await req;
  if (res.status >= 300) throw new Error(`Setup request failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res;
}

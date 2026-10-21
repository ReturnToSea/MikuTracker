import { getConfig } from "../config";
import { createNexonClient, type NexonClient, type NexonDeps } from "./client";

// The real network, the real clock and the configured address.
export function realNexonDeps(): NexonDeps {
  return {
    baseUrl: getConfig().nexonRankingsUrl,
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  };
}

// The real client, created on first use. Tests pass their own.
let real: NexonClient | undefined;
export function nexon(): NexonClient {
  real ??= createNexonClient(realNexonDeps());
  return real;
}

export { NexonError } from "./errors";
export type { CharacterLookup, NexonClient } from "./client";

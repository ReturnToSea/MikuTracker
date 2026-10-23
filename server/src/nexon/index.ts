import { getConfig } from "../config";
import { createNexonClient, type NexonClient, type NexonDeps } from "./client";
import { isNexonImage } from "./rankings";

// An avatar address, sent to the fake image server when one is set (the QA copy):
// https://msavatar1.nexon.net/Character/X.png → <images>/msavatar1.nexon.net/Character/X.png
export function imageAddress(url: string, images: string | null): string {
  if (!images || !isNexonImage(url)) return url;
  const u = new URL(url);
  return `${images}/${u.hostname}${u.pathname}${u.search}`;
}

// The real network, the real clock and the configured addresses.
export function realNexonDeps(): NexonDeps {
  return {
    baseUrl: getConfig().nexonRankingsUrl,
    fetch: (url, init) => fetch(imageAddress(url, getConfig().nexonImagesUrl), init),
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

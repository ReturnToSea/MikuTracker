import { readdirSync } from "node:fs";
import path from "node:path";
import { getConfig } from "../config";

// The picture files in the data folder's item-icons/ (or one of its folders: the HEXA page's hexa/),
// read once per request (none when the folder doesn't exist).
export function iconFiles(folder = ""): Set<string> {
  try {
    return new Set(readdirSync(path.join(getConfig().itemIconDir, folder)));
  } catch {
    return new Set();
  }
}

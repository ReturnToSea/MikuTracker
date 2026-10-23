import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LABEL, launchAgentPlist, logFile, plistFile, xmlText } from "./launchAgent";

// A checkout in a folder with characters XML must escape.
const setup = { node: "/opt/homebrew/bin/node", repo: "/Users/me/Code & <Stuff>/MikuTracker", home: "/Users/me", port: 4750 };

describe("the launch agent", () => {
  it("lives in the usual places", () => {
    expect(plistFile("/Users/me")).toBe("/Users/me/Library/LaunchAgents/com.mikutracker.app.plist");
    expect(logFile("/Users/me")).toBe("/Users/me/Library/Logs/MikuTracker/app.log");
    expect(LABEL).toBe("com.mikutracker.app");
  });

  it("escapes text for XML, & first", () => {
    expect(xmlText("a & b <c> &lt;")).toBe("a &amp; b &lt;c&gt; &amp;lt;");
  });

  // macOS's own tool reads the file back: proof macOS will understand it.
  it.runIf(process.platform === "darwin")("is a settings file macOS reads as: run the server at login with the real data, backups and refresh on, and again if it stops", () => {
    mkdirSync(process.env.MIKU_DATA_DIR!, { recursive: true });
    const dir = mkdtempSync(path.join(process.env.MIKU_DATA_DIR!, "agent-test-"));
    try {
      const file = path.join(dir, "agent.plist");
      writeFileSync(file, launchAgentPlist(setup));
      const read = JSON.parse(execFileSync("plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" }));
      expect(read).toEqual({
        Label: "com.mikutracker.app",
        ProgramArguments: [
          "/opt/homebrew/bin/node",
          "/Users/me/Code & <Stuff>/MikuTracker/node_modules/tsx/dist/cli.mjs",
          "/Users/me/Code & <Stuff>/MikuTracker/server/src/index.ts",
        ],
        WorkingDirectory: "/Users/me/Code & <Stuff>/MikuTracker/server",
        EnvironmentVariables: { HOST: "127.0.0.1", PORT: "4750", MIKU_DATABASE: "real", MIKU_BACKUPS: "on", MIKU_REFRESH: "on", PATH: "/opt/homebrew/bin:/usr/bin:/bin" },
        RunAtLoad: true,
        KeepAlive: true,
        ThrottleInterval: 10,
        StandardOutPath: "/Users/me/Library/Logs/MikuTracker/app.log",
        StandardErrorPath: "/Users/me/Library/Logs/MikuTracker/app.log",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses the port it's given", () => {
    expect(launchAgentPlist({ ...setup, port: 4321 })).toContain("<key>PORT</key>\n    <string>4321</string>");
  });
});

import path from "node:path";

// Starting the app when you log in to the Mac: a macOS "launch agent" (a small settings file in
// ~/Library/LaunchAgents) tells macOS to run the server at login and start it again if it ever
// stops. Closing the lid only puts the Mac to sleep, which pauses the app; it carries on when
// the Mac wakes. Set up and removed with npm run app:install / app:uninstall (scripts/app.ts).
// Adapted from Goal Tracker.
export const LABEL = "com.mikutracker.app";

export interface AgentSetup {
  node: string; // the node program
  repo: string; // the always-on app's own copy of the code
  home: string;
  port: number;
}

export const plistFile = (home: string) => path.join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
export const logFile = (home: string) => path.join(home, "Library", "Logs", "MikuTracker", "app.log");

// Text inside the settings file (XML) can't contain & < > as they are.
export const xmlText = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// The launch agent's settings file: run the server (through tsx) from the server folder, with the
// real database, backups and the Nexon refresh on, only reachable from this Mac, at login, and
// again if it stops (at most every 10 seconds), with its output in ~/Library/Logs/MikuTracker/app.log.
export function launchAgentPlist(s: AgentSetup): string {
  const str = (v: string) => `<string>${xmlText(v)}</string>`;
  const env: Record<string, string> = {
    HOST: "127.0.0.1",
    PORT: String(s.port),
    MIKU_DATABASE: "real",
    MIKU_BACKUPS: "on",
    MIKU_REFRESH: "on",
    PATH: `${path.dirname(s.node)}:/usr/bin:/bin`,
  };
  const entries = Object.entries(env).map(([k, v]) => `    <key>${k}</key>\n    ${str(v)}`);
  // Stryker disable next-line StringLiteral: only whitespace between entries, which macOS ignores (the plutil test reads the file back)
  const envXml = entries.join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  ${str(LABEL)}
  <key>ProgramArguments</key>
  <array>
    ${str(s.node)}
    ${str(path.join(s.repo, "node_modules", "tsx", "dist", "cli.mjs"))}
    ${str(path.join(s.repo, "server", "src", "index.ts"))}
  </array>
  <key>WorkingDirectory</key>
  ${str(path.join(s.repo, "server"))}
  <key>EnvironmentVariables</key>
  <dict>
${envXml}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>StandardOutPath</key>
  ${str(logFile(s.home))}
  <key>StandardErrorPath</key>
  ${str(logFile(s.home))}
</dict>
</plist>
`;
}

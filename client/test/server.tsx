import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

// A fake API: `routes` maps "GET /settings" to a response body (or a function of the request
// body and the full address, query included). Every request is recorded in `calls` so tests can
// check what was sent.
export function fakeServer(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const path = url.replace(/^\/api/, "");
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, path, body });
      const exact = `${method} ${path.split("?")[0]}`;
      const key = exact in routes ? exact : exact.replace(/\/\d+/g, "/:id"); // "GET /characters/7/progress" → "GET /characters/:id/progress"
      if (!(key in routes)) return new Response(JSON.stringify({ error: `No fake for ${exact}` }), { status: 404 });
      const route = routes[key];
      const out = typeof route === "function" ? await route(body, path) : route; // a never-settling promise keeps it pending
      if (out instanceof Response) return out;
      if (out === undefined) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(out), { status: 200 });
    }),
  );
  return {
    calls,
    sent: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path).map((c) => c.body),
  };
}

export function renderWithApp(ui: ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// A made-up EXP table: level L needs L × 1,000 EXP (simple to check by hand), except that level
// 200 needs 300,000 (a +51% jump) and 260 needs 600,000 (a +132% jump, shown as a big one).
export function fakeExpTable() {
  let total = 0;
  const rows = Array.from({ length: 299 }, (_, i) => {
    const level = i + 1;
    const expToNext = level === 200 ? 300_000 : level === 260 ? 600_000 : level * 1_000;
    total += expToNext;
    return { level, expToNext, total };
  });
  return { patch: "v.271", date: "2026-09", rows };
}

// A character's progress with no history yet.
export const NO_PROGRESS = {
  today: "2026-10-20",
  bars: Array.from({ length: 90 }, (_, i) => ({ day: new Date(Date.UTC(2026, 9, 20 - 89 + i)).toISOString().slice(0, 10), gained: null, covers: 0 })),
  levels: [],
  ranges: [7, 14, 30, 90].map((days) => ({ days, stats: null, goals: [] })),
};

// A world's Bosses tab with no characters: the week of Thu 15 Oct 2026, and two bosses (one
// weekly, one monthly) instead of the whole list.
export const EMPTY_BOSSES = {
  pricesPatch: "v.270",
  week: { start: "2026-10-15", resetsAt: "2026-10-22T00:00:00.000Z" },
  month: { name: "2026-10", resetsAt: "2026-11-01T00:00:00.000Z" },
  limits: { perCharacter: 14, perWorld: 180 },
  bosses: [
    { id: "zakum", name: "Zakum", kind: "weekly", art: null, difficulties: [{ difficulty: "Chaos", maxParty: 6, perPerson: [81e6, 40.5e6, 27e6, 20.25e6, 16.2e6, 13.5e6] }] },
    { id: "black_mage", name: "Black Mage", kind: "monthly", art: null, difficulties: [{ difficulty: "Hard", maxParty: 6, perPerson: [4.5e9, 2.25e9, 1.5e9, 1.125e9, 0.9e9, 0.75e9] }] },
  ],
  characters: [],
  totals: { planned: 0, soFar: 0, cleared: 0, bosses: 0, crystals: 0, monthlyPlanned: 0, monthlySoFar: 0 },
};

// A world's checklist with no characters: Tue 20 Oct 2026, and three tasks (a daily, a limited
// daily, a weekly) instead of the presets.
export const EMPTY_CHECKLIST = {
  patch: "v.271",
  daily: { day: "2026-10-20", resetsAt: "2026-10-21T00:00:00.000Z" },
  weekly: { week: "2026-10-15", resetsAt: "2026-10-22T00:00:00.000Z" },
  tasks: [
    { id: "cernium", name: "Cernium", category: "sacred", reset: "daily", weekday: null, level: 260, limit: null, custom: null, resetsAt: "2026-10-21T00:00:00.000Z" },
    { id: "ursus", name: "Ursus", category: "other", reset: "daily", weekday: null, level: 100, limit: { scope: "account", count: 1 }, custom: null, resetsAt: "2026-10-21T00:00:00.000Z" },
    { id: "erda-spectrum", name: "Erda Spectrum", category: "arcane", reset: "weekly", weekday: 4, level: 200, limit: null, custom: null, resetsAt: "2026-10-22T00:00:00.000Z" },
  ],
  characters: [],
  limits: [{ task: "ursus", users: [] }],
};

// The usual answers: Ren saved on Kronos, no theme art, no characters yet.
export const BASE_ROUTES = {
  "GET /settings": { theme: "ren", worldId: 45, blackFlamePrice: 3_000_000 },
  "GET /theme-art": { ren: null, pochacco: null },
  "GET /exp-table": fakeExpTable(),
  "GET /characters": { characters: [], selectedId: null },
  "GET /refresh": { last: null },
  "GET /characters/:id/progress": NO_PROGRESS,
  "GET /bosses": EMPTY_BOSSES,
  "GET /checklist": EMPTY_CHECKLIST,
  "GET /symbols": { patch: "v.271", symbols: [], characters: [] },
  "GET /gear": { generated: "2026-10-23", slots: [], items: [], jobs: {}, characters: [] },
};

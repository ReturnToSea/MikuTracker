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
      const key = `${method} ${path.split("?")[0]}`;
      if (!(key in routes)) return new Response(JSON.stringify({ error: `No fake for ${key}` }), { status: 404 });
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

// The usual answers: Ren saved on Kronos, no theme art, no characters yet.
export const BASE_ROUTES = {
  "GET /settings": { theme: "ren", worldId: 45 },
  "GET /theme-art": { ren: null, pochacco: null },
  "GET /exp-table": fakeExpTable(),
  "GET /characters": { characters: [], selectedId: null },
};

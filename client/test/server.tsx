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
// body). Every request is recorded in `calls` so tests can check what was sent.
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
      const out = typeof route === "function" ? await route(body) : route; // a never-settling promise keeps it pending
      if (out instanceof Response) return out;
      return new Response(JSON.stringify(out ?? {}), { status: 200 });
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

// The usual answers: Ren saved, no theme art.
export const BASE_ROUTES = {
  "GET /settings": { theme: "ren", worldId: 45 },
  "GET /theme-art": { ren: null, pochacco: null },
};

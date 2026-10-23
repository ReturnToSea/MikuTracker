import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { artImage, knownTheme } from "../src/lib/themes";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

const pageTheme = () => document.documentElement.dataset.theme;
const artVar = (theme: string) => document.documentElement.style.getPropertyValue(`--art-${theme}`);
const card = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

describe("the saved theme", () => {
  it("is applied to the whole page", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /settings": { theme: "pochacco", worldId: 45 } });
    renderWithApp(<App />);
    await waitFor(() => expect(pageTheme()).toBe("pochacco"));
  });

  it("an unknown theme from the server falls back to Ren", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /settings": { theme: "dark", worldId: 45 } });
    document.documentElement.dataset.theme = "pochacco";
    renderWithApp(<App />);
    await waitFor(() => expect(pageTheme()).toBe("ren"));
  });
});

describe("the Themes tab", () => {
  it("shows both themes, with the one in use marked", async () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />, "/themes");
    await waitFor(() => expect(card("Ren").getAttribute("aria-pressed")).toBe("true"));
    expect(card("Pochacco").getAttribute("aria-pressed")).toBe("false");
    expect(card("Ren").textContent).toContain("In use");
    expect(card("Pochacco").textContent).not.toContain("In use");
    // Each card previews its own theme, with a little chart and a description.
    expect([card("Ren").dataset.theme, card("Pochacco").dataset.theme]).toEqual(["ren", "pochacco"]);
    for (const name of ["Ren", "Pochacco"]) expect(card(name).querySelectorAll(".mini span")).toHaveLength(9);
    expect(card("Ren").textContent).toContain("moonlit violet night");
    expect(card("Pochacco").textContent).toContain("light-blue gingham");
  });

  it("choosing a theme saves it and applies it", async () => {
    const server = fakeServer({ ...BASE_ROUTES, "PUT /settings": (body: { theme: string }) => ({ theme: body.theme, worldId: 45 }) });
    renderWithApp(<App />, "/themes");
    await waitFor(() => expect(card("Ren").getAttribute("aria-pressed")).toBe("true"));
    await userEvent.click(card("Pochacco"));
    expect(server.sent("PUT", "/settings")).toEqual([{ theme: "pochacco" }]);
    await waitFor(() => expect(pageTheme()).toBe("pochacco"));
    expect(card("Pochacco").getAttribute("aria-pressed")).toBe("true");
  });

  it("the cards can't be clicked again while a save is in progress", async () => {
    fakeServer({ ...BASE_ROUTES, "PUT /settings": () => new Promise(() => {}) });
    renderWithApp(<App />, "/themes");
    await waitFor(() => expect(card("Ren").getAttribute("aria-pressed")).toBe("true"));
    await userEvent.click(card("Pochacco"));
    await waitFor(() => expect((card("Pochacco") as HTMLButtonElement).disabled).toBe(true));
    expect((card("Ren") as HTMLButtonElement).disabled).toBe(true);
  });

  it("a failed save says so and keeps the current theme", async () => {
    fakeServer({ ...BASE_ROUTES, "PUT /settings": new Response(JSON.stringify({ error: "Invalid input" }), { status: 400 }) });
    renderWithApp(<App />, "/themes");
    await waitFor(() => expect(card("Ren").getAttribute("aria-pressed")).toBe("true"));
    await userEvent.click(card("Pochacco"));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save the theme: Invalid input");
    expect(pageTheme()).toBe("ren");
    expect(card("Ren").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("theme art", () => {
  it("each theme's art gets its own variable, whichever theme is in use (so each card previews its own art)", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /theme-art": { ren: "/theme-art/ren.png?v=2", pochacco: "/theme-art/pochacco.png?v=1" } });
    renderWithApp(<App />);
    await waitFor(() => expect(artVar("pochacco")).toBe('url("/theme-art/pochacco.png?v=1")'));
    expect(artVar("ren")).toBe('url("/theme-art/ren.png?v=2")');
  });

  it("a theme without art has no variable, even when another theme has art", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /theme-art": { ren: null, pochacco: "/theme-art/pochacco.png?v=1" } });
    renderWithApp(<App />);
    await waitFor(() => expect(artVar("pochacco")).not.toBe(""));
    expect(artVar("ren")).toBe("");
  });

  it("art that disappears from the list is removed", async () => {
    const art = { ren: null as string | null, pochacco: "/theme-art/pochacco.png?v=1" as string | null };
    fakeServer({ ...BASE_ROUTES, "GET /theme-art": () => ({ ...art }) });
    const view = renderWithApp(<App />);
    await waitFor(() => expect(artVar("pochacco")).not.toBe(""));
    art.pochacco = null;
    view.unmount();
    renderWithApp(<App />);
    await waitFor(() => expect(artVar("pochacco")).toBe(""));
  });

  it("Ren without art draws its own background; with art, or as Pochacco, it doesn't", async () => {
    fakeServer(BASE_ROUTES);
    const first = renderWithApp(<App />);
    expect(screen.getByTestId("ren-sky").getAttribute("aria-hidden")).toBe("true");
    first.unmount();

    fakeServer({ ...BASE_ROUTES, "GET /theme-art": { ren: "/theme-art/ren.png?v=2", pochacco: null } });
    renderWithApp(<App />);
    await waitFor(() => expect(screen.queryByTestId("ren-sky")).toBeNull());
  });

  it("switching to Ren, the page is already Ren's when the sky starts (it reads Ren's colors then)", async () => {
    // Found by hand: after Pochacco, the production build drew a black tree, no blossoms and black
    // petals, because the sky read the colors while the page was still marked Pochacco.
    const themeWhenSkyStarted: (string | undefined)[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      themeWhenSkyStarted.push(pageTheme());
      return null; // the test browser can't draw; the sky stops here
    });
    let theme = "pochacco";
    fakeServer({ ...BASE_ROUTES, "GET /settings": () => ({ theme, worldId: 45 }), "PUT /settings": (body: { theme: string }) => ((theme = body.theme), { theme, worldId: 45 }) });
    renderWithApp(<App />, "/themes");
    await waitFor(() => expect(pageTheme()).toBe("pochacco"));
    await userEvent.click(card("Ren"));
    await waitFor(() => expect(screen.getByTestId("ren-sky")).toBeTruthy());
    expect(themeWhenSkyStarted.length).toBeGreaterThan(0);
    expect(themeWhenSkyStarted.filter((t) => t !== "ren")).toEqual([]); // every start saw Ren's page
  });

  it("the sky carries Ren's colors itself (marked as Ren, whatever the page's theme)", async () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    expect((await screen.findByTestId("ren-sky")).dataset.theme).toBe("ren");
  });

  it("Pochacco has no drawn background", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /settings": { theme: "pochacco", worldId: 45 } });
    renderWithApp(<App />);
    await waitFor(() => expect(pageTheme()).toBe("pochacco"));
    expect(screen.queryByTestId("ren-sky")).toBeNull();
  });
});

describe("theme helpers", () => {
  it("knownTheme keeps known themes and replaces anything else with Ren", () => {
    expect([knownTheme("ren"), knownTheme("pochacco"), knownTheme("dark"), knownTheme(undefined)]).toEqual(["ren", "pochacco", "ren", "ren"]);
  });

  it("artImage turns an address into a CSS image, and nothing into null", () => {
    expect(artImage("/theme-art/ren.png?v=1")).toBe('url("/theme-art/ren.png?v=1")');
    expect([artImage(null), artImage(undefined), artImage("")]).toEqual([null, null, null]);
  });
});

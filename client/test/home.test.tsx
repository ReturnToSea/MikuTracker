import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CharacterView } from "../src/api/types";
import { App } from "../src/App";
import { alreadyAdded, levelProgress } from "../src/lib/characters";
import { moveBy, moveTo, sameOrder } from "../src/lib/order";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// Made-up characters, as the server sends them.
function character(id: number, name: string, extra: Partial<CharacterView> = {}): CharacterView {
  return {
    id,
    worldId: 45,
    name,
    job: "Kanna",
    level: 285,
    exp: 86_500_000_000_000,
    expToNext: 99_512_176_519_276,
    worldRank: 6_390,
    overallRank: 19_172,
    legion: { level: 5_804, raidPower: 297_290_139, from: name },
    avatar: `/avatars/${name.toLowerCase()}.png`,
    addedAt: new Date(Date.UTC(2026, 9, 20)),
    checkedAt: new Date(Date.UTC(2026, 9, 20)),
    missingSince: null,
    ...extra,
  };
}

// A search result as the server sends it: the avatar arrives as image data.
const FOUND = {
  name: "NewOne",
  worldId: 45,
  level: 250,
  exp: 93_289_912_904,
  expToNext: 186_579_825_808,
  job: "Hero",
  worldRank: 1_234,
  overallRank: 56_789,
  legion: { level: 3_210, raidPower: 45_000_000 },
  avatar: "data:image/png;base64,iVBORw0KGgo=",
};

// A fake server that remembers: worlds with characters, selection, order, adding and deleting.
function home(worlds: Record<number, CharacterView[]> = {}, worldId = 45) {
  const state = { worldId, worlds: { 45: [], 70: [], ...worlds } as Record<number, CharacterView[]>, selected: {} as Record<number, number> };
  const worldOf = (path: string) => Number(new URLSearchParams(path.split("?")[1]).get("world"));
  const listOf = (world: number) => ({ characters: state.worlds[world]!, selectedId: state.selected[world] ?? state.worlds[world]![0]?.id ?? null });
  const server = fakeServer({
    ...BASE_ROUTES,
    "GET /settings": () => ({ theme: "ren", worldId: state.worldId }),
    "PUT /settings": (body: { worldId: number }) => {
      state.worldId = body.worldId;
      return { theme: "ren", worldId: state.worldId };
    },
    "GET /characters": (_: unknown, path: string) => listOf(worldOf(path)),
    "GET /search": (_: unknown, path: string) => {
      const name = new URLSearchParams(path.split("?")[1]).get("name")!;
      if (name.toLowerCase() === "sakurarin") return new Response(JSON.stringify({ error: "SakuraRin is on Hyperion, not Kronos.", kind: "other-world" }), { status: 409 });
      return { ...FOUND, name: name === "newone" ? "NewOne" : name, worldId: worldOf(path) };
    },
    "POST /characters": (body: { world: number; name: string }) => {
      const added = character(100 + state.worlds[body.world]!.length, body.name, { worldId: body.world, level: 250 });
      state.worlds[body.world]!.push(added);
      state.selected[body.world] = added.id;
      return added;
    },
    "PUT /characters/order": (body: { world: number; ids: number[] }) => {
      state.worlds[body.world] = body.ids.map((id) => state.worlds[body.world]!.find((c) => c.id === id)!);
      return listOf(body.world);
    },
  });
  // Selecting and deleting have the id in the address.
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const m = /^\/api\/characters\/(\d+)(\/select)?$/.exec(url);
    if (m) {
      const id = Number(m[1]);
      server.calls.push({ method: init.method ?? "GET", path: url.replace(/^\/api/, ""), body: undefined });
      const world = Number(Object.keys(state.worlds).find((w) => state.worlds[Number(w)]!.some((c) => c.id === id)));
      if (m[2]) state.selected[world] = id;
      else state.worlds[world] = state.worlds[world]!.filter((c) => c.id !== id);
      return new Response(null, { status: 204 });
    }
    return realFetch(url, init);
  });
  return { server, state };
}

const tabs = () => within(screen.getByRole("tablist", { name: "Characters" })).queryAllByRole("tab");
const tabNames = () => tabs().map((t) => t.querySelector("b")!.textContent);
const tab = (name: string) => tabs().find((t) => t.querySelector("b")!.textContent === name)!;
const summary = () => screen.getAllByRole("region").find((r) => r.querySelector(".hero"))!;
const worldButton = (name: string) => within(screen.getByRole("group", { name: "World" })).getByRole("button", { name });
// Give anything about to be sent a moment to go out, before checking nothing was.
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("the world switcher", () => {
  it("shows the saved world, and switching saves it and shows that world's characters", async () => {
    const { server } = home({ 45: [character(1, "MikuBeam")], 70: [character(2, "SakuraRin", { worldId: 70 })] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["MikuBeam"]));
    expect([worldButton("Kronos").getAttribute("aria-pressed"), worldButton("Hyperion").getAttribute("aria-pressed")]).toEqual(["true", "false"]);
    await userEvent.click(worldButton("Hyperion"));
    await waitFor(() => expect(tabNames()).toEqual(["SakuraRin"]));
    expect(server.sent("PUT", "/settings")).toEqual([{ worldId: 70 }]);
    expect(worldButton("Hyperion").getAttribute("aria-pressed")).toBe("true");
  });

  it("an empty world says how to add a character", async () => {
    home({}, 70);
    renderWithApp(<App />);
    expect(await screen.findByText("No characters on Hyperion yet. Use + to add one.")).toBeTruthy();
    expect(tabs()).toEqual([]);
  });
});

describe("the character tabs", () => {
  it("show each character's avatar, name, level and job, in order, with the selected one marked", async () => {
    home({ 45: [character(1, "MikuBeam"), character(2, "LeekSpin", { level: 272, job: "Bishop", avatar: null })] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["MikuBeam", "LeekSpin"]));
    expect(tab("LeekSpin").textContent).toContain("Lv. 272 · Bishop");
    expect(tab("MikuBeam").querySelector("img")!.getAttribute("src")).toBe("/avatars/mikubeam.png");
    expect(within(tab("LeekSpin")).getByRole("img").getAttribute("aria-label")).toBe("LeekSpin (no avatar yet)");
    expect(tabs().map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(screen.queryByText(/No characters/)).toBeNull();
  });

  it("clicking one selects it", async () => {
    const { server } = home({ 45: [character(1, "MikuBeam"), character(2, "LeekSpin")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toHaveLength(2));
    await userEvent.click(tab("LeekSpin"));
    expect(server.calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(["/characters/2/select"]);
    await waitFor(() => expect(tab("LeekSpin").getAttribute("aria-selected")).toBe("true"));
    expect(within(summary()).getByRole("heading", { level: 2 }).textContent).toBe("LeekSpin");
  });

  it("Alt + → and Alt + ← move a tab, saving the new order", async () => {
    const { server } = home({ 45: [character(1, "A"), character(2, "B"), character(3, "C")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B", "C"]));
    expect(fireEvent.keyDown(tab("A"), { key: "ArrowRight", altKey: true })).toBe(false); // handled: the browser's own Alt + → (Forward) doesn't happen
    await waitFor(() => expect(tabNames()).toEqual(["B", "A", "C"]));
    fireEvent.keyDown(tab("C"), { key: "ArrowLeft", altKey: true });
    await waitFor(() => expect(tabNames()).toEqual(["B", "C", "A"]));
    expect(server.sent("PUT", "/characters/order")).toEqual([
      { world: 45, ids: [2, 1, 3] },
      { world: 45, ids: [2, 3, 1] },
    ]);
  });

  it("a move shows at once, even before the server has saved it", async () => {
    home({ 45: [character(1, "A"), character(2, "B")] });
    fakeServer({ ...BASE_ROUTES, "GET /characters": { characters: [character(1, "A"), character(2, "B")], selectedId: 1 }, "PUT /characters/order": () => new Promise(() => {}) });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B"]));
    fireEvent.keyDown(tab("A"), { key: "ArrowRight", altKey: true });
    expect(tabNames()).toEqual(["B", "A"]);
  });

  it("after a move, a newly added character still shows up", async () => {
    home({ 45: [character(1, "A"), character(2, "B")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B"]));
    fireEvent.keyDown(tab("A"), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(tabNames()).toEqual(["B", "A"]));
    await userEvent.click(screen.getByRole("button", { name: "Add a character" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Character name" }), "newone{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Add NewOne" }));
    await waitFor(() => expect(tabNames()).toEqual(["B", "A", "NewOne"]));
  });

  it("a move with nowhere to go, or arrows without Alt, saves nothing", async () => {
    const { server } = home({ 45: [character(1, "A"), character(2, "B")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B"]));
    fireEvent.keyDown(tab("A"), { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(tab("B"), { key: "ArrowRight", altKey: true });
    expect(fireEvent.keyDown(tab("A"), { key: "ArrowRight" })).toBe(true); // not handled
    fireEvent.keyDown(tab("A"), { key: "Enter", altKey: true });
    await settle();
    expect(tabNames()).toEqual(["A", "B"]);
    expect(server.sent("PUT", "/characters/order")).toEqual([]);
  });

  it("dragging a tab onto another moves it there as you drag, and saves when you let go", async () => {
    const { server } = home({ 45: [character(1, "A"), character(2, "B"), character(3, "C")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B", "C"]));
    const dataTransfer = { effectAllowed: "" };
    fireEvent.dragStart(tab("A"), { dataTransfer });
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(tab("A").classList.contains("dragging")).toBe(true);
    fireEvent.dragOver(tab("C"), { dataTransfer });
    expect(tabNames()).toEqual(["B", "C", "A"]); // moved while dragging, not saved yet
    expect(server.sent("PUT", "/characters/order")).toEqual([]);
    fireEvent.dragEnd(tab("A"), { dataTransfer });
    expect(tab("A").classList.contains("dragging")).toBe(false);
    await waitFor(() => expect(server.sent("PUT", "/characters/order")).toEqual([{ world: 45, ids: [2, 3, 1] }]));
  });

  it("dragging over a tab when nothing is being dragged changes nothing, and letting go where it started saves nothing", async () => {
    const { server } = home({ 45: [character(1, "A"), character(2, "B")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B"]));
    const over = fireEvent.dragOver(tab("B"), { dataTransfer: {} });
    expect(over).toBe(true); // not handled: the browser's default stays
    expect(tabNames()).toEqual(["A", "B"]);
    fireEvent.dragStart(tab("A"), { dataTransfer: {} });
    expect(fireEvent.dragOver(tab("B"), { dataTransfer: {} })).toBe(false); // handled: it's a place to drop
    expect(tabNames()).toEqual(["B", "A"]);
    fireEvent.dragOver(tab("A"), { dataTransfer: {} }); // over itself: no change
    expect(tabNames()).toEqual(["B", "A"]);
    fireEvent.dragOver(tab("B"), { dataTransfer: {} }); // back over B: A returns to where it started
    fireEvent.dragEnd(tab("A"), { dataTransfer: {} });
    await settle();
    expect(tabNames()).toEqual(["A", "B"]);
    expect(server.sent("PUT", "/characters/order")).toEqual([]);
  });
});

describe("the selected character", () => {
  it("shows its name, job, world, ranks, level, EXP progress and Legion", async () => {
    home({ 45: [character(1, "MikuBeam")] });
    renderWithApp(<App />);
    const s = await waitFor(() => summary());
    expect(within(s).getByRole("heading", { level: 2 }).textContent).toBe("MikuBeam");
    expect(s.querySelector(".meta")!.textContent).toBe("Kanna · Kronos");
    expect(s.querySelector(".level")!.textContent).toBe("285");
    expect(s.querySelector("small")!.textContent).toBe("86.92% to level 286 · 86.5T / 99.5T EXP");
    expect(within(s).getByRole("progressbar", { name: "EXP into level 285" }).getAttribute("aria-valuenow")).toBe("86.92");
    expect((s.querySelector(".expbar > div") as HTMLElement).style.width).toMatch(/^86\.92/);
    // the world rank and the overall rank in two places of their own, then Legion
    expect(Array.from(s.querySelectorAll(".stat .label")).map((v) => v.textContent)).toEqual(["Kronos rank", "Overall rank", "Kronos Legion", "Raid power"]);
    expect(Array.from(s.querySelectorAll(".stat .value")).map((v) => v.textContent)).toEqual(["#6,390", "#19,172", "5,804", "297,290,139"]);
    expect(s.querySelectorAll(".stat")[1]!.textContent).toContain("all NA worlds");
    expect(s.querySelector("img")!.getAttribute("alt")).toBe("MikuBeam's avatar");
  });

  it("without an overall rank or Legion, and at level 300", async () => {
    home({ 45: [character(1, "TwinTails", { level: 300, exp: 0, expToNext: null, overallRank: null, legion: null })] });
    renderWithApp(<App />);
    const s = await waitFor(() => summary());
    expect(s.querySelector(".meta")!.textContent).toBe("Kanna · Kronos");
    expect(s.querySelector("small")!.textContent).toBe("Level 300: the highest level.");
    expect(within(s).queryByRole("progressbar")).toBeNull();
    expect(Array.from(s.querySelectorAll(".stat .value")).map((v) => v.textContent)).toEqual(["#6,390", "—", "N/A", "N/A"]);
    expect(s.querySelectorAll(".stat")[2]!.querySelector(".small")!.textContent).toBe("Add the character Nexon lists your Legion under to see it.");
  });

  it("shows the world's Legion with the character it's listed under (none when it's this one)", async () => {
    const legion = { level: 5_804, raidPower: 297_290_139, from: "MikuBeam" };
    home({ 45: [character(1, "MikuBeam", { legion }), character(2, "LeekSpin", { legion })] });
    renderWithApp(<App />);
    const own = await waitFor(() => summary());
    expect(own.querySelectorAll(".stat")[2]!.querySelector(".small")).toBeNull();
    await userEvent.click(tab("LeekSpin"));
    await waitFor(() => expect(within(summary()).getByRole("heading", { level: 2 }).textContent).toBe("LeekSpin"));
    expect(Array.from(summary().querySelectorAll(".stat .value")).slice(2).map((v) => v.textContent)).toEqual(["5,804", "297,290,139"]);
    expect(summary().querySelectorAll(".stat")[2]!.querySelector(".small")!.textContent).toBe("listed under MikuBeam");
  });

  it("a character no longer found in the rankings says so, and still shows its last saved numbers", async () => {
    home({ 45: [character(1, "MikuBeam", { missingSince: new Date(Date.UTC(2026, 9, 21, 8)) })] });
    renderWithApp(<App />);
    const s = await waitFor(() => summary());
    expect(within(s).getByRole("status").textContent).toBe("Not found in Nexon's rankings since Oct 21 (renamed, or no longer ranked). Showing its last saved numbers.");
    expect(s.querySelector(".level")!.textContent).toBe("285");
  });

  it("a character still found has no such note", async () => {
    home({ 45: [character(1, "MikuBeam")] });
    renderWithApp(<App />);
    const s = await waitFor(() => summary());
    expect(within(s).queryByRole("status")).toBeNull();
  });

  it("deleting asks first; saying no keeps it", async () => {
    const { server } = home({ 45: [character(1, "MikuBeam")] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithApp(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete MikuBeam…" }));
    expect(confirm).toHaveBeenCalledWith("Delete MikuBeam? This also deletes all of its saved history.");
    expect(server.calls.filter((c) => c.method === "DELETE")).toEqual([]);
  });

  it("deleting after saying yes removes it", async () => {
    const { server } = home({ 45: [character(1, "MikuBeam"), character(2, "LeekSpin")] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithApp(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete MikuBeam…" }));
    expect(server.calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual(["/characters/1"]);
    await waitFor(() => expect(tabNames()).toEqual(["LeekSpin"]));
  });

  it("a move shows at once with any ids (not only ones already in number order)", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /characters": { characters: [character(7, "A"), character(3, "B"), character(5, "C")], selectedId: 7 }, "PUT /characters/order": () => new Promise(() => {}) });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B", "C"]));
    fireEvent.keyDown(tab("A"), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(tabNames()).toEqual(["B", "A", "C"]));
  });

  it("when the server's order changes, it replaces the one just moved", async () => {
    // The server saves A, B, C as C, A, B (say, another window moved C meanwhile): its order wins.
    const list = [character(1, "A"), character(2, "B"), character(3, "C")];
    fakeServer({
      ...BASE_ROUTES,
      "GET /characters": () => ({ characters: list, selectedId: 1 }),
      "PUT /characters/order": () => {
        list.splice(0, 3, list[2]!, list[0]!, list[1]!);
        return { characters: list, selectedId: 1 };
      },
    });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B", "C"]));
    fireEvent.keyDown(tab("A"), { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(tabNames()).toEqual(["C", "A", "B"]));
  });

  it("a move the server fails to save goes back to the saved order, and says so", async () => {
    fakeServer({
      ...BASE_ROUTES,
      "GET /characters": { characters: [character(1, "A"), character(2, "B")], selectedId: 1 },
      "PUT /characters/order": new Response(JSON.stringify({ error: "Couldn't save the order" }), { status: 500 }),
    });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["A", "B"]));
    fireEvent.keyDown(tab("A"), { key: "ArrowRight", altKey: true });
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save the order");
    await waitFor(() => expect(tabNames()).toEqual(["A", "B"]));
  });

  it("deleting after a move that went nowhere (Alt + → on the last tab) still works", async () => {
    // Found by hand in the browser: the page went blank ("reading 'avatar'" of a deleted character).
    home({ 45: [character(1, "MikuBeam"), character(2, "LeekSpin")] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["MikuBeam", "LeekSpin"]));
    fireEvent.keyDown(tab("LeekSpin"), { key: "ArrowRight", altKey: true }); // already last
    await userEvent.click(tab("LeekSpin"));
    await userEvent.click(await screen.findByRole("button", { name: "Delete LeekSpin…" }));
    await waitFor(() => expect(tabNames()).toEqual(["MikuBeam"]));
  });

  it("adding after a move that went nowhere shows the new tab at once", async () => {
    home({ 45: [character(1, "MikuBeam")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["MikuBeam"]));
    fireEvent.keyDown(tab("MikuBeam"), { key: "ArrowLeft", altKey: true }); // already first
    await userEvent.click(screen.getByRole("button", { name: "Add a character" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Character name" }), "newone");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add NewOne" }));
    await waitFor(() => expect(tabNames()).toEqual(["MikuBeam", "NewOne"]));
  });

  it("a failed change says so", async () => {
    home({ 45: [character(1, "MikuBeam"), character(2, "LeekSpin")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toHaveLength(2));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 }));
    await userEvent.click(tab("LeekSpin"));
    expect((await screen.findByRole("alert")).textContent).toBe("Not found");
  });

  it("while the characters load, it says so (and not that there are none)", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /characters": () => new Promise(() => {}) });
    renderWithApp(<App />);
    expect(await screen.findByText("Loading…")).toBeTruthy();
    expect(screen.queryByText(/No characters/)).toBeNull();
    expect(tabs()).toEqual([]);
  });

  it("a change reloads that world's characters, not everything else", async () => {
    const { server } = home({ 45: [character(1, "MikuBeam"), character(2, "LeekSpin")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toHaveLength(2));
    await userEvent.click(tab("LeekSpin"));
    await waitFor(() => expect(tab("LeekSpin").getAttribute("aria-selected")).toBe("true"));
    await settle();
    expect(server.calls.filter((c) => c.method === "GET" && c.path === "/settings")).toHaveLength(1);
    expect(server.calls.filter((c) => c.method === "GET" && c.path === "/theme-art")).toHaveLength(1);
    expect(server.calls.filter((c) => c.method === "GET" && c.path.startsWith("/characters?"))).toHaveLength(2); // the list, before and after (not each character's progress)
  });

  it("a list that can't be loaded says so", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /characters": new Response(JSON.stringify({ error: "Server error" }), { status: 500 }) });
    renderWithApp(<App />);
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load the characters: Server error");
  });
});

describe("adding a character", () => {
  const plus = () => screen.getByRole("button", { name: "Add a character" });
  const nameBox = () => screen.getByRole("textbox", { name: "Character name" });

  it("+ opens the search box for the world shown; Escape or a click outside closes it", async () => {
    home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    expect(plus().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Add a character" }).querySelector("h3")!.textContent).toBe("Add a character on Kronos");
    expect(document.activeElement).toBe(nameBox());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(plus());
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(plus());
    await userEvent.click(plus()); // + again closes it too
    expect(plus().getAttribute("aria-expanded")).toBe("false");
  });

  it("closing forgets what was typed, found and said; reopening starts clean", async () => {
    home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "Miku Beam{Enter}");
    expect(screen.getByRole("alert")).toBeTruthy();
    await userEvent.clear(nameBox());
    await userEvent.type(nameBox(), "SakuraRin{Enter}");
    await screen.findByText("SakuraRin is on Hyperion, not Kronos.");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(plus());
    expect((nameBox() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closing stops listening for Escape and outside clicks", async () => {
    home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    const removed = vi.spyOn(document, "removeEventListener");
    await userEvent.keyboard("{Escape}");
    expect(removed.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["keydown", "mousedown"]));
  });

  it("the search form stays on the page (the browser doesn't submit it)", async () => {
    home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    expect(fireEvent.submit(nameBox().closest("form")!)).toBe(false);
  });

  it("searching again clears a failed add's message", async () => {
    home();
    fakeServer({
      ...BASE_ROUTES,
      "GET /search": FOUND,
      "POST /characters": new Response(JSON.stringify({ error: "Nexon's rankings can't be reached right now. Try again later." }), { status: 503 }),
    });
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "NewOne{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Add NewOne" }));
    expect((await screen.findByRole("alert")).textContent).toContain("can't be reached");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("a click inside the box, or another key, keeps it open", async () => {
    home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    fireEvent.mouseDown(nameBox());
    await userEvent.keyboard("a");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("search, then Add: the character is added, selected, and the box closes", async () => {
    const { server } = home({ 45: [character(1, "MikuBeam")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toEqual(["MikuBeam"]));
    await userEvent.click(plus());
    await userEvent.type(nameBox(), " newone {Enter}");
    expect(server.calls.filter((c) => c.method === "GET" && c.path.startsWith("/search")).map((c) => c.path)).toEqual(["/search?world=45&name=newone"]);
    // A preview the way Home will show it, with the avatar the server sent (2×, 192 px).
    const found = (await screen.findByText("NewOne")).closest(".found") as HTMLElement;
    const avatar = within(found).getByRole("img", { name: "NewOne's avatar" });
    expect([avatar.getAttribute("src"), avatar.getAttribute("width")]).toEqual(["data:image/png;base64,iVBORw0KGgo=", "192"]);
    expect(found.querySelector(".found-head")!.textContent).toBe("NewOneHero · KronosLevel250");
    expect(within(found).getByRole("progressbar", { name: "NewOne's EXP into level 250" }).getAttribute("aria-valuenow")).toBe("50");
    expect(found.querySelector(".found-details > div:nth-child(2) .small")!.textContent).toBe("50.00% to level 251 · 93.3B / 187B EXP");
    expect(Array.from(found.querySelectorAll(".found-stats > div")).map((d) => d.textContent)).toEqual(["In Kronos#1,234", "Overall#56,789", "Legion3,210", "Raid power45,000,000"]);
    await userEvent.click(screen.getByRole("button", { name: "Add NewOne" }));
    expect(server.sent("POST", "/characters")).toEqual([{ world: 45, name: "NewOne" }]);
    await waitFor(() => expect(tabNames()).toEqual(["MikuBeam", "NewOne"]));
    expect(tab("NewOne").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names are checked before asking: letters and numbers only", async () => {
    const { server } = home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "Miku Beam{Enter}");
    expect(screen.getByRole("alert").textContent).toBe("Names are 1–12 letters and numbers");
    await userEvent.clear(nameBox());
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("alert").textContent).toBe("Names are 1–12 letters and numbers");
    expect(server.calls.filter((c) => c.path.startsWith("/search"))).toEqual([]);
  });

  it("Nexon's answer is shown when the character can't be added", async () => {
    home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "SakuraRin{Enter}");
    expect((await screen.findByRole("alert")).textContent).toBe("SakuraRin is on Hyperion, not Kronos.");
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: /^Add/ })).toBeNull(); // no result, so nothing to add
  });

  it("without a picture, an overall rank or Legion, and at level 300", async () => {
    home();
    fakeServer({ ...BASE_ROUTES, "GET /search": { ...FOUND, level: 300, exp: 0, expToNext: null, overallRank: null, legion: null, avatar: null } });
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "NewOne{Enter}");
    const found = (await screen.findByText("NewOne")).closest(".found") as HTMLElement;
    expect(within(found).getByRole("img").getAttribute("aria-label")).toBe("NewOne (no avatar yet)");
    expect(within(found).queryByRole("progressbar")).toBeNull();
    expect(found.textContent).toContain("Level 300: the highest level.");
    expect(Array.from(found.querySelectorAll(".found-stats dd")).map((d) => d.textContent)).toEqual(["#1,234", "—", "N/A", "N/A"]);
  });

  it("a found character not listed for Legion shows the Legion already on this world", async () => {
    home({ 45: [character(1, "LeekSpin", { legion: null }), character(2, "MikuBeam", { legion: { level: 5_804, raidPower: 297_290_139, from: "MikuBeam" } })] });
    fakeServer({ ...BASE_ROUTES, "GET /characters": { characters: [character(1, "LeekSpin", { legion: null }), character(2, "MikuBeam", { legion: { level: 5_804, raidPower: 297_290_139, from: "MikuBeam" } })], selectedId: 1 }, "GET /search": { ...FOUND, legion: null } });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toHaveLength(2));
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "NewOne{Enter}");
    const found = (await screen.findByText("NewOne")).closest(".found") as HTMLElement;
    expect(Array.from(found.querySelectorAll(".found-stats dd")).map((d) => d.textContent)).toEqual(["#1,234", "#56,789", "5,804", "297,290,139"]);
    expect(found.querySelector(".found-stats .small")!.textContent).toBe("listed under MikuBeam");
  });

  it("a found character with its own Legion entry shows that one", async () => {
    home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "NewOne{Enter}");
    const found = (await screen.findByText("NewOne")).closest(".found") as HTMLElement;
    expect(found.querySelector(".found-stats > div:nth-child(3) dd")!.textContent).toBe("3,210");
    expect(found.querySelector(".found-stats .small")).toBeNull(); // its own: no "listed under"
  });

  it("a character already on this world shows as Added", async () => {
    home({ 45: [character(1, "MikuBeam")] });
    renderWithApp(<App />);
    await waitFor(() => expect(tabNames()).toHaveLength(1));
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "mikubeam{Enter}");
    const button = await screen.findByRole("button", { name: "Added" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("while searching and adding, the buttons say so and can't be pressed again", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /search": () => new Promise(() => {}) });
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "MikuBeam{Enter}");
    const searching = await screen.findByRole("button", { name: "Searching…" });
    expect((searching as HTMLButtonElement).disabled).toBe(true);
  });

  it("while adding, Add says so and can't be pressed again; a failed add says why", async () => {
    let finish: (r: Response) => void = () => {};
    home();
    const server = fakeServer({
      ...BASE_ROUTES,
      "GET /search": FOUND,
      "POST /characters": () => new Promise<Response>((resolve) => (finish = resolve)),
    });
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.type(nameBox(), "NewOne{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Add NewOne" }));
    expect(((await screen.findByRole("button", { name: "Adding…" })) as HTMLButtonElement).disabled).toBe(true);
    finish(new Response(JSON.stringify({ error: "NewOne is already added on Kronos." }), { status: 409 }));
    expect((await screen.findByRole("alert")).textContent).toBe("NewOne is already added on Kronos.");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(server.sent("POST", "/characters")).toEqual([{ world: 45, name: "NewOne" }]);
  });

  it("switching worlds closes the search box (it belongs to the world shown)", async () => {
    home();
    renderWithApp(<App />);
    await userEvent.click(plus());
    await userEvent.click(worldButton("Hyperion"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("helpers", () => {
  it("moveTo puts the moved tab where the target was", () => {
    expect(moveTo([1, 2, 3], 1, 3)).toEqual([2, 3, 1]);
    expect(moveTo([1, 2, 3], 3, 1)).toEqual([3, 1, 2]);
    expect(moveTo([1, 2, 3], 2, 3)).toEqual([1, 3, 2]);
    expect(moveTo([1, 2, 3], 2, 2)).toEqual([1, 2, 3]);
    expect(moveTo([1, 2, 3], 9, 2)).toEqual([1, 2, 3]);
    expect(moveTo([1, 2, 3], 2, 9)).toEqual([1, 2, 3]);
    expect(moveTo([1, 2, 3], 1, 9)).toEqual([1, 2, 3]);
    expect(moveTo([1, 2, 3], 3, 9)).toEqual([1, 2, 3]);
  });

  it("moveBy moves one place, if there's room", () => {
    expect(moveBy([1, 2, 3], 2, -1)).toEqual([2, 1, 3]);
    expect(moveBy([1, 2, 3], 2, 1)).toEqual([1, 3, 2]);
    expect(moveBy([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveBy([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
    expect(moveBy([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
  });

  it("sameOrder", () => {
    expect(sameOrder([1, 2], [1, 2])).toBe(true);
    expect(sameOrder([1, 2], [2, 1])).toBe(false);
    expect(sameOrder([1, 2], [1, 2, 3])).toBe(false);
    expect(sameOrder([], [])).toBe(true);
  });

  it("levelProgress: percent of the level and EXP had / needed", () => {
    expect(levelProgress({ exp: 50, expToNext: 200 })).toEqual({ percent: 25, text: "25.00%", have: "50", need: "200" });
    expect(levelProgress({ exp: 0, expToNext: null })).toBeNull();
  });

  it("alreadyAdded ignores capitals", () => {
    expect(alreadyAdded([{ name: "MikuBeam" }], "MIKUBEAM")).toBe(true);
    expect(alreadyAdded([{ name: "MikuBeam" }], "MikuBeam2")).toBe(false);
  });
});

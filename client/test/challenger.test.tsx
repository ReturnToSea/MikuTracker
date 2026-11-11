import { CLASSES } from "@miku/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CharacterView, ProgressView } from "../src/api/types";
import { App } from "../src/App";
import { classMatches, exactClass } from "../src/lib/characters";
import { typedDetail, typedScale } from "../src/lib/levelChart";
import { BASE_ROUTES, fakeServer, NO_PROGRESS, renderWithApp } from "./server";

// Challenger on Home (v4.2.0): characters added and kept up to date by hand.
function byHand(id: number, name: string, extra: Partial<CharacterView> = {}): CharacterView {
  return {
    id,
    worldId: 900,
    name,
    job: "Ren",
    level: 247,
    exp: 0,
    expToNext: 1,
    byHand: true,
    worldRank: null,
    overallRank: null,
    legion: null,
    avatar: null,
    addedAt: new Date(Date.UTC(2026, 10, 11)),
    checkedAt: new Date(Date.UTC(2026, 10, 27)),
    missingSince: null,
    ...extra,
  };
}

const TODAY = "2026-11-30";
const day = (d: number) => `2026-11-${String(d).padStart(2, "0")}`;
// Typed on the 17th (241), 19th (243), 21st (245), 24th (246) and 27th (247); every day since the 17th listed.
const TYPED_AT = new Map([[17, 241], [19, 243], [21, 245], [24, 246], [27, 247]]);
const TYPED: ProgressView = {
  ...NO_PROGRESS,
  today: TODAY,
  // the 90 days ending today, no EXP (as the server sends a Challenger character's)
  bars: Array.from({ length: 90 }, (_, i) => ({ day: new Date(Date.UTC(2026, 10, 30 - 89 + i)).toISOString().slice(0, 10), gained: null, covers: 0 })),
  typed: Array.from({ length: 14 }, (_, i) => {
    const d = 17 + i;
    const level = [...TYPED_AT].filter(([at]) => at <= d).at(-1)![1];
    return { day: day(d), level, typed: TYPED_AT.has(d) };
  }),
};

// A fake server that remembers the Challenger characters: adding and changing them.
function challenger(characters: CharacterView[] = [byHand(1, "Mikurin")], progress: ProgressView = TYPED) {
  const state = { characters, selected: null as number | null };
  const server = fakeServer({
    ...BASE_ROUTES,
    "GET /settings": { theme: "ren", worldId: 900 },
    "GET /characters": () => ({ characters: state.characters, selectedId: state.selected ?? state.characters[0]?.id ?? null }),
    "POST /characters/:id/select": (_: unknown, path: string) => {
      state.selected = Number(path.split("/")[2]);
      return new Response(null, { status: 204 });
    },
    "GET /characters/:id/progress": progress,
    "POST /characters": (body: { name: string; job: string; level: number }) => {
      const added = byHand(100, body.name, { job: body.job, level: body.level });
      state.characters = [added, ...state.characters];
      state.selected = added.id;
      return added;
    },
    "PATCH /characters/:id": (body: { name?: string; level?: number }) => {
      if (body.name === "Taken") return new Response(JSON.stringify({ error: "Taken is already added on Challenger." }), { status: 409 });
      const id = state.selected ?? state.characters[0]!.id;
      state.characters = state.characters.map((c) => (c.id === id ? { ...c, ...body } : c));
      return state.characters.find((c) => c.id === id);
    },
  });
  renderWithApp(<App />);
  return server;
}

// The + once Challenger (the saved world) shows: before that, the page is on Kronos.
async function plus() {
  await waitFor(() => expect(within(screen.getByRole("group", { name: "World" })).getByRole("button", { name: "Challenger" }).getAttribute("aria-pressed")).toBe("true"));
  return screen.getByRole("button", { name: "Add a character" });
}
const summary = () => within(screen.getAllByRole("region").find((r) => r.querySelector(".hero"))!);
const addBox = () => within(screen.getByRole("dialog", { name: "Add a character" }));
const options = () => within(screen.getByRole("listbox")).queryAllByRole("option").map((o) => o.textContent);

describe("the class list's helpers", () => {
  it("filters by the letters typed anywhere in the name (capitals and spaces around ignored), those starting with them first, A–Z", () => {
    expect(classMatches("ni", CLASSES)).toEqual(["Night Lord", "Night Walker", "Arch Mage Ice/Lightning", "Dark Knight", "Mechanic"]);
    expect(classMatches("  LE ", CLASSES)).toEqual(["Lethe", "Adele", "Battle Mage", "Mihile", "Sia Astelle"]);
    expect(classMatches("", ["Ren", "Ark", "Lethe"])).toEqual(["Ark", "Lethe", "Ren"]);
    expect(classMatches("zz", CLASSES)).toEqual([]);
  });

  it("a class typed in full (capitals and spaces around ignored) is that class, as the list spells it", () => {
    expect([exactClass(" ren ", CLASSES), exactClass("NIGHT WALKER", CLASSES), exactClass("Night", CLASSES), exactClass("", CLASSES)]).toEqual(["Ren", "Night Walker", null, null]);
  });

  it("the typed levels' scale: whole levels, one level of room each side (within 1–300), at most 6 steps", () => {
    expect(typedScale([])).toBeNull();
    expect(typedScale([247])).toEqual({ lo: 246, hi: 248, ticks: [246, 247, 248] });
    expect(typedScale([241, 247])).toEqual({ lo: 240, hi: 248, ticks: [240, 242, 244, 246, 248] });
    expect(typedScale([200, 247])).toEqual({ lo: 199, hi: 248, ticks: [207, 216, 225, 234, 243] });
    expect(typedScale([1, 300])).toEqual({ lo: 1, hi: 300, ticks: [50, 100, 150, 200, 250, 300] });
    expect(typedScale([300])).toEqual({ lo: 299, hi: 300, ticks: [299, 300] });
  });

  it("a day's tooltip: its level, typed that day or carried", () => {
    expect(typedDetail("2026-11-27", 247, true, TODAY)).toBe("Fri, Nov 27: level 247 (typed)");
    expect(typedDetail(TODAY, 247, false, TODAY)).toBe("Mon, Nov 30 (today): level 247 (no change)");
  });
});

describe("adding a Challenger character", () => {
  it("name, a class picked from the list (typing filters it, ↓ and Enter pick), and level: sent as typed", async () => {
    const server = challenger([]);
    await userEvent.click(await plus());
    expect(addBox().getByRole("heading").textContent).toBe("Add a character on Challenger");
    expect(addBox().getByText(/The class can't be changed later/)).toBeTruthy();
    await userEvent.type(addBox().getByLabelText("Name"), "Hatsune");
    const cls = addBox().getByRole("combobox", { name: "Class" });
    await userEvent.type(cls, "ni");
    expect(options()).toEqual(["Night Lord", "Night Walker", "Arch Mage Ice/Lightning", "Dark Knight", "Mechanic"]);
    expect(addBox().getByText("5 of 54 classes")).toBeTruthy();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect((cls as HTMLInputElement).value).toBe("Night Walker");
    expect(screen.queryByRole("listbox")).toBeNull();
    await userEvent.type(addBox().getByLabelText("Level"), "200");
    await userEvent.click(addBox().getByRole("button", { name: "Add Hatsune" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(server.sent("POST", "/characters")).toEqual([{ world: 900, name: "Hatsune", job: "Night Walker", level: 200 }]);
    await waitFor(() => expect(summary().getByRole("heading", { level: 2 }).textContent).toBe("Hatsune"));
  });

  it("▾ shows every class, and clicking one picks it; changing the text unpicks it", async () => {
    const server = challenger([]);
    await userEvent.click(await plus());
    await userEvent.click(addBox().getByRole("button", { name: "Show every class" }));
    expect(options()).toEqual([...CLASSES]);
    await userEvent.click(screen.getByRole("option", { name: "Lethe" }));
    const cls = addBox().getByRole("combobox", { name: "Class" }) as HTMLInputElement;
    expect(cls.value).toBe("Lethe");
    await userEvent.type(cls, "x");
    await userEvent.type(addBox().getByLabelText("Name"), "Hatsune");
    await userEvent.type(addBox().getByLabelText("Level"), "200");
    await userEvent.click(addBox().getByRole("button", { name: "Add Hatsune" }));
    expect(addBox().getByRole("alert").textContent).toBe("Pick a class from the list");
    expect(server.sent("POST", "/characters")).toEqual([]);
  });

  it("a class typed in full counts as picked, without clicking it", async () => {
    const server = challenger([]);
    await userEvent.click(await plus());
    await userEvent.type(addBox().getByLabelText("Name"), "Hatsune");
    await userEvent.type(addBox().getByRole("combobox", { name: "Class" }), "night walker");
    await userEvent.type(addBox().getByLabelText("Level"), "200");
    await userEvent.click(addBox().getByRole("button", { name: "Add Hatsune" }));
    await waitFor(() => expect(server.sent("POST", "/characters")).toEqual([{ world: 900, name: "Hatsune", job: "Night Walker", level: 200 }]));
  });

  it("after a pick, the keys go on from the class picked in the full list", async () => {
    challenger([]);
    await userEvent.click(await plus());
    const cls = addBox().getByRole("combobox", { name: "Class" }) as HTMLInputElement;
    await userEvent.type(cls, "re");
    expect(options().slice(0, 2)).toEqual(["Ren", "Arch Mage Fire/Poison"]);
    await userEvent.keyboard("{Enter}");
    expect(cls.value).toBe("Ren");
    await userEvent.keyboard("{ArrowDown}"); // the closed list opens, on Ren
    expect(screen.getByRole("option", { selected: true }).textContent).toBe("Ren");
    await userEvent.keyboard("{ArrowDown}{Enter}"); // the class after Ren, A–Z
    expect(cls.value).toBe("Shade");
  });

  it("▾ opens every class on the one picked, or on the first", async () => {
    challenger([]);
    await userEvent.click(await plus());
    const cls = addBox().getByRole("combobox", { name: "Class" });
    await userEvent.type(cls, "ar");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await userEvent.click(addBox().getByRole("button", { name: "Show every class" })); // closes
    await userEvent.click(addBox().getByRole("button", { name: "Show every class" }));
    expect(options()).toEqual([...CLASSES]);
    expect(screen.getByRole("option", { selected: true }).textContent).toBe("Adele");
    await userEvent.click(screen.getByRole("option", { name: "Lethe" }));
    await userEvent.click(addBox().getByRole("button", { name: "Show every class" }));
    expect(screen.getByRole("option", { selected: true }).textContent).toBe("Lethe");
  });

  it("a name already on Challenger says so before sending (capitals ignored)", async () => {
    const server = challenger([byHand(1, "Mikurin")]);
    await userEvent.click(await plus());
    await userEvent.type(addBox().getByLabelText("Name"), "mikurin");
    await userEvent.type(addBox().getByRole("combobox", { name: "Class" }), "Ren");
    await userEvent.type(addBox().getByLabelText("Level"), "200");
    await userEvent.click(addBox().getByRole("button", { name: "Add mikurin" }));
    expect(addBox().getByRole("alert").textContent).toBe("mikurin is already added on Challenger.");
    expect(server.sent("POST", "/characters")).toEqual([]);
  });

  it.each([
    ["", "Ren", "200", "Names are 1–12 letters and numbers"],
    ["Hatsune", "Ren", "", "Levels are 1 to 300"],
    ["Hatsune", "Ren", "301", "Levels are 1 to 300"],
    ["Hatsune", "Ren", "0", "Levels are 1 to 300"],
  ])("refuses name %j, level %j before sending", async (name, job, level, message) => {
    const server = challenger([]);
    await userEvent.click(await plus());
    if (name) await userEvent.type(addBox().getByLabelText("Name"), name);
    await userEvent.type(addBox().getByRole("combobox", { name: "Class" }), job);
    await userEvent.click(screen.getByRole("option", { name: job }));
    if (level) await userEvent.type(addBox().getByLabelText("Level"), level);
    await userEvent.click(addBox().getByRole("button", { name: /^Add/ }));
    expect(addBox().getByRole("alert").textContent).toBe(message);
    expect(server.sent("POST", "/characters")).toEqual([]);
  });
});

describe("a Challenger character on Home", () => {
  it("its name, class and world, a blank picture, its level; no EXP bar, ranks or Legion", async () => {
    challenger();
    await waitFor(() => expect(summary().getByRole("heading", { level: 2 }).textContent).toBe("Mikurin"));
    expect(summary().getByText("Ren · Challenger")).toBeTruthy();
    expect(summary().getByRole("img").getAttribute("aria-label")).toBe("Mikurin (no picture)");
    expect(summary().queryByRole("progressbar")).toBeNull();
    expect(summary().queryByText(/rank|Legion|Raid power/)).toBeNull();
    expect(document.querySelector(".level")!.textContent).toBe("247");
  });

  it("Change level: a box; a lower level asks first (Save anyway); saved, the box closes", async () => {
    const server = challenger();
    await userEvent.click(await screen.findByRole("button", { name: "Change level" }));
    const box = summary().getByLabelText("New level");
    expect((box as HTMLInputElement).value).toBe("247");
    await userEvent.clear(box);
    await userEvent.type(box, "245");
    expect(summary().getByRole("alert").textContent).toBe("That's lower than 247. Fixing a typo? It's saved as today's level.");
    await userEvent.clear(box);
    await userEvent.type(box, "248");
    expect(summary().queryByRole("alert")).toBeNull();
    await userEvent.click(summary().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(summary().queryByLabelText("New level")).toBeNull());
    expect(server.sent("PATCH", "/characters/1")).toEqual([{ level: 248 }]);
    await waitFor(() => expect(document.querySelector(".level")!.textContent).toBe("248"));
  });

  it("a lower level is sent once confirmed with Save anyway; a level outside 1–300 isn't sent; Cancel closes", async () => {
    const server = challenger();
    await userEvent.click(await screen.findByRole("button", { name: "Change level" }));
    const box = summary().getByLabelText("New level");
    await userEvent.clear(box);
    await userEvent.type(box, "301");
    await userEvent.click(summary().getByRole("button", { name: "Save" }));
    expect(summary().getByRole("alert").textContent).toBe("Levels are 1 to 300");
    await userEvent.clear(box);
    await userEvent.type(box, "246");
    await userEvent.click(summary().getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(server.sent("PATCH", "/characters/1")).toEqual([{ level: 246 }]));
    await userEvent.click(await summary().findByRole("button", { name: "Change level" }));
    await userEvent.click(summary().getByRole("button", { name: "Cancel" }));
    expect(summary().queryByLabelText("New level")).toBeNull();
  });

  it("Change level saved without changing it: closes, nothing sent (no day marked as typed)", async () => {
    const server = challenger();
    await userEvent.click(await screen.findByRole("button", { name: "Change level" }));
    await userEvent.click(summary().getByRole("button", { name: "Save" }));
    expect(summary().queryByLabelText("New level")).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.sent("PATCH", "/characters/1")).toEqual([]);
  });

  it("switching to another character closes an open rename or level box (it never changes the other one)", async () => {
    const server = challenger([byHand(1, "Mikurin"), byHand(2, "Leekspin", { level: 211 })]);
    await userEvent.click(await screen.findByRole("button", { name: "Rename…" }));
    await userEvent.clear(summary().getByLabelText("New name"));
    await userEvent.type(summary().getByLabelText("New name"), "NewName");
    await userEvent.click(summary().getByRole("button", { name: "Change level" }));
    await userEvent.click(screen.getByRole("tab", { name: /Leekspin/ }));
    await waitFor(() => expect(summary().getByRole("heading", { level: 2 }).textContent).toBe("Leekspin"));
    expect(summary().queryByLabelText("New name")).toBeNull();
    expect(summary().queryByLabelText("New level")).toBeNull();
    expect(server.sent("PATCH", "/characters/2")).toEqual([]);
  });

  it("Rename…: sent once valid; the server's refusal shows", async () => {
    const server = challenger();
    await userEvent.click(await screen.findByRole("button", { name: "Rename…" }));
    const box = summary().getByLabelText("New name");
    await userEvent.clear(box);
    await userEvent.type(box, "Miku Rin");
    await userEvent.click(summary().getByRole("button", { name: "Save" }));
    expect(summary().getByRole("alert").textContent).toBe("Names are 1–12 letters and numbers");
    await userEvent.clear(box);
    await userEvent.type(box, "Taken");
    await userEvent.click(summary().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(summary().getByRole("alert").textContent).toBe("Taken is already added on Challenger."));
    await userEvent.clear(box);
    await userEvent.type(box, "Hatsune");
    await userEvent.click(summary().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(summary().getByRole("heading", { level: 2 }).textContent).toBe("Hatsune"));
    expect(server.sent("PATCH", "/characters/1")).toEqual([{ name: "Taken" }, { name: "Hatsune" }]); // the bad name never sent
  });

  it("instead of the EXP chart and time to level: the note and the typed levels, a dot on each day typed, its day ranges", async () => {
    challenger();
    const graph = await screen.findByRole("group", { name: "Level per day" });
    expect(screen.getByText(/Added by hand/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Chart" })).toBeNull(); // no EXP / Level switch
    expect(screen.queryByText("Time to level")).toBeNull();
    expect(graph.querySelectorAll(".level-dot")).toHaveLength(5);
    const cols = [...graph.querySelectorAll(".level-col")];
    expect(cols).toHaveLength(14);
    expect(cols.map((c) => c.getAttribute("title"))).toEqual(
      Array.from({ length: 14 }, (_, i) => typedDetail(day(17 + i), TYPED.typed![i]!.level, TYPED.typed![i]!.typed, TODAY)),
    );
    await userEvent.click(within(screen.getByRole("group", { name: "Days shown" })).getByRole("button", { name: "30 days" }));
    const wide = [...screen.getByRole("group", { name: "Level per day" }).querySelectorAll(".level-col")];
    expect(wide).toHaveLength(30);
    expect(wide.filter((c) => c.classList.contains("no-data"))).toHaveLength(16); // before it was added
    expect(wide[0]!.getAttribute("title")).toBe("Nov 1: before it was added");
  });

  it("with nothing typed in the days shown: says so", async () => {
    challenger(undefined, { ...TYPED, typed: [] });
    expect(await screen.findByText("No level typed in these days.")).toBeTruthy();
  });
});

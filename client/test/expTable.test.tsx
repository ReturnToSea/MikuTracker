import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { jumpLevel, rangeFor, rowsIn } from "../src/lib/expTable";
import { BASE_ROUTES, fakeExpTable, fakeServer, renderWithApp } from "./server";

const bodyRows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1); // without the header
const firstCells = () => bodyRows().map((r) => r.querySelector("td")!.textContent);
const cells = (level: number) => Array.from(document.getElementById(`level-${level}`)!.querySelectorAll("td")).map((td) => td.textContent);
const rangeButton = (name: string) => within(screen.getByRole("group", { name: "Levels" })).getByRole("button", { name });
// The range buttons marked as chosen (always exactly one).
const pressed = () =>
  within(screen.getByRole("group", { name: "Levels" }))
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.textContent);
const jumpTo = async (text: string) => {
  await userEvent.clear(screen.getByRole("textbox", { name: "Jump to level" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Jump to level" }), `${text}{Enter}`);
};
const marked = () => bodyRows().filter((r) => r.getAttribute("aria-current") === "true").map((r) => r.id);

async function openTable(routes: Record<string, unknown> = BASE_ROUTES) {
  fakeServer(routes);
  renderWithApp(<App />, "/exp-table");
  await screen.findByRole("table");
}

describe("the EXP table tab", () => {
  it("starts on levels 200–299", async () => {
    await openTable();
    expect(pressed()).toEqual(["200–299"]);
    expect(firstCells()).toHaveLength(100);
    expect(firstCells()[0]).toBe("200 → 201");
    expect(firstCells().at(-1)).toBe("299 → 300");
  });

  it("shows each level's EXP in full and short, the change, and the total from level 1", async () => {
    await openTable();
    // Level 201: 201,000 EXP; level 200 needed 300,000; total = (1..199 × 1,000) + 300,000 + 201,000
    expect(cells(201)).toEqual(["201 → 202", "201,000", "201K", "-33.0%", "20.4M"]);
  });

  it("marks big jumps (+100% or more)", async () => {
    await openTable();
    const jump = document.getElementById("level-260")!.querySelectorAll("td")[3]!;
    expect([jump.textContent, jump.classList.contains("big")]).toEqual(["+131.7%", true]); // 600,000 / 259,000 − 1
    expect(document.getElementById("level-261")!.querySelectorAll("td")[3]!.classList.contains("big")).toBe(false);
    // +50.8% (300,000 / 199,000 − 1) is a jump, but not a big one
    const smaller = document.getElementById("level-200")!.querySelectorAll("td")[3]!;
    expect([smaller.textContent, smaller.classList.contains("big")]).toEqual(["+50.8%", false]);
  });

  it("the ranges show 1–199 and all 299 levels; level 1 has no change", async () => {
    await openTable();
    await userEvent.click(rangeButton("1–199"));
    expect(firstCells()).toHaveLength(199);
    expect(cells(1)).toEqual(["1 → 2", "1,000", "1.00K", "—", "1.00K"]);
    expect(pressed()).toEqual(["1–199"]);
    await userEvent.click(rangeButton("All"));
    expect(firstCells()).toHaveLength(299);
    expect(pressed()).toEqual(["All"]);
  });

  it("jumping to a level marks it, switching ranges when it isn't shown", async () => {
    await openTable();
    await userEvent.type(screen.getByRole("textbox", { name: "Jump to level" }), "150{Enter}");
    expect(rangeButton("1–199").getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("level-150")!.getAttribute("aria-current")).toBe("true");
    expect(bodyRows().filter((r) => r.getAttribute("aria-current") === "true")).toHaveLength(1);
  });

  it("jumping within the range shown keeps the range; changing range clears the mark", async () => {
    await openTable();
    await userEvent.click(rangeButton("All"));
    await userEvent.type(screen.getByRole("textbox", { name: "Jump to level" }), "250");
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(rangeButton("All").getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("level-250")!.getAttribute("aria-current")).toBe("true");
    await userEvent.click(rangeButton("200–299"));
    expect(document.getElementById("level-250")!.getAttribute("aria-current")).toBeNull();
  });

  it("jumping brings the row into view", async () => {
    await openTable();
    await jumpTo("150");
    const row = document.getElementById("level-150")!;
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toEqual([row]);
  });

  it("jumping from 1–199 to a higher level switches to 200–299", async () => {
    await openTable();
    await userEvent.click(rangeButton("1–199"));
    await jumpTo("250");
    expect([pressed(), marked()]).toEqual([["200–299"], ["level-250"]]);
  });

  it("jumping to the first or last level while showing All stays on All", async () => {
    await openTable();
    await userEvent.click(rangeButton("All"));
    await jumpTo("1");
    expect([pressed(), marked()]).toEqual([["All"], ["level-1"]]);
    await jumpTo("299");
    expect([pressed(), marked()]).toEqual([["All"], ["level-299"]]);
  });

  it("the jump form stays on the page (the browser doesn't submit it)", async () => {
    await openTable();
    const form = screen.getByRole("textbox", { name: "Jump to level" }).closest("form")!;
    expect(fireEvent.submit(form)).toBe(false); // false: the page handled it and stopped the browser
  });

  it("an impossible level changes nothing else", async () => {
    await openTable();
    await jumpTo("150");
    await jumpTo("abc");
    expect([pressed(), marked()]).toEqual([["1–199"], ["level-150"]]);
  });

  it("an impossible level says so", async () => {
    await openTable();
    await userEvent.type(screen.getByRole("textbox", { name: "Jump to level" }), "300{Enter}");
    expect(screen.getByRole("alert").textContent).toBe("Enter a level from 1 to 299.");
    await userEvent.clear(screen.getByRole("textbox", { name: "Jump to level" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Jump to level" }), "205{Enter}");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says which patch the table is current as of", async () => {
    await openTable();
    expect(screen.getByText(/Current as of/).textContent).toBe("Current as of v.271 (2026-09)");
  });

  it("shows loading, then an error if the table can't be loaded", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /exp-table": new Response(JSON.stringify({ error: "Server error" }), { status: 500 }) });
    renderWithApp(<App />, "/exp-table");
    expect(screen.getByText("Loading…")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't load the EXP table: Server error"));
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("EXP table helpers", () => {
  it("rangeFor picks the narrower range a level is in", () => {
    expect([rangeFor(1), rangeFor(199), rangeFor(200), rangeFor(299)]).toEqual(["1-199", "1-199", "200-299", "200-299"]);
  });

  it("rowsIn keeps the rows in a range, ends included", () => {
    const rows = fakeExpTable().rows;
    expect(rowsIn(rows, "200-299").map((r) => r.level)).toEqual(Array.from({ length: 100 }, (_, i) => 200 + i));
    expect(rowsIn(rows, "1-199")).toHaveLength(199);
    expect(rowsIn(rows, "all")).toHaveLength(299);
  });

  it("jumpLevel accepts whole levels 1–299 only", () => {
    expect([jumpLevel("1"), jumpLevel(" 250 "), jumpLevel("299")]).toEqual([1, 250, 299]);
    expect([jumpLevel("0"), jumpLevel("300"), jumpLevel("2.5"), jumpLevel("abc"), jumpLevel(""), jumpLevel("-5")]).toEqual([null, null, null, null, null, null]);
  });
});

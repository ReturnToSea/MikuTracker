import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// The rail's main tabs (a group's tab counts once; its pages are listed under it).
const nav = () => within(screen.getByRole("navigation", { name: "Features" }));
const tabs = () => nav().getAllByRole("link").filter((l) => l.classList.contains("tab"));
const tabNames = () => tabs().map((l) => l.textContent!.replace("▾", "").trim());
const gearPages = () => within(nav().getByRole("group", { name: "Gear pages" })).getAllByRole("link");

describe("the feature tabs", () => {
  it("are Home, Bosses, Checklist, Symbols and Gear, then the EXP table and Themes", () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    expect(tabNames()).toEqual(["Home", "Bosses", "Checklist", "Symbols", "Gear", "EXP table", "Themes"]);
  });

  it("each opens its page, and only its own tab is marked as current", async () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    const pages: [string, string][] = [
      ["EXP table", "EXP table (GMS)"],
      ["Themes", "Themes"],
      ["Bosses", "Bosses"],
      ["Checklist", "Checklist"],
      ["Symbols", "Symbols"],
      ["Home", "Home"],
    ];
    for (const [label, heading] of pages) {
      const tab = tabs().find((l) => l.textContent === label)!;
      await userEvent.click(tab);
      expect(screen.getByRole("heading", { level: 1 })).toHaveProperty("textContent", heading);
      expect(nav().getAllByRole("link").filter((l) => l.classList.contains("active"))).toEqual([tab]);
    }
  });

  it("Gear is a group: its tab opens Equipment, its pages are listed under it and marked when open", async () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    const gear = tabs().find((l) => l.textContent!.startsWith("Gear"))!;
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(gear);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gear");
    // a wide window has no pop-up menu (its pages are listed under the tab instead)
    expect(gear.closest(".rail-group")!.classList.contains("menu")).toBe(false);
    expect(gear.getAttribute("aria-expanded")).toBe("true");
    expect(gearPages().map((l) => [l.textContent, l.classList.contains("active")])).toEqual([["Equipment", true], ["Flames", false], ["Star Force", false], ["Potential", false]]);
    await userEvent.click(gearPages()[1]!);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Flames");
    expect(gearPages().map((l) => l.classList.contains("active"))).toEqual([false, true, false, false]);
    await userEvent.click(gearPages()[2]!);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Star Force");
    expect(gearPages().map((l) => l.classList.contains("active"))).toEqual([false, false, true, false]);
    await userEvent.click(gearPages()[3]!);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Potential");
    expect(gearPages().map((l) => l.classList.contains("active"))).toEqual([false, false, false, true]);
    expect(gear.getAttribute("aria-expanded")).toBe("true");
    // leaving the group folds it up
    await userEvent.click(tabs().find((l) => l.textContent === "Home")!);
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    expect(nav().getAllByRole("link").filter((l) => l.classList.contains("active")).map((l) => l.textContent)).toEqual(["Home"]);
  });

  it("each shows an icon", () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    expect(tabs().map((l) => l.querySelectorAll("svg").length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("go to the right addresses", () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    expect(tabs().map((l) => l.getAttribute("href"))).toEqual(["/", "/bosses", "/checklist", "/symbols", "/gear", "/exp-table", "/themes"]);
    expect(gearPages().map((l) => l.getAttribute("href"))).toEqual(["/gear", "/gear/flames", "/gear/starforce", "/gear/potential"]);
  });

  it("an unknown address goes to Home", async () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />, "/no-such-page");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Home"));
  });

  it("each page opens straight from its address", () => {
    fakeServer(BASE_ROUTES);
    for (const [path, heading] of [
      ["/", "Home"],
      ["/tbd/3", "TBD"],
      ["/bosses", "Bosses"],
      ["/checklist", "Checklist"],
      ["/symbols", "Symbols"],
      ["/gear", "Gear"],
      ["/gear/flames", "Flames"],
      ["/gear/starforce", "Star Force"],
      ["/gear/potential", "Potential"],
      ["/exp-table", "EXP table (GMS)"],
      ["/themes", "Themes"],
    ]) {
      const { unmount } = renderWithApp(<App />, path);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(heading);
      unmount();
    }
  });
});

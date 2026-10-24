import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

const tabNames = () => within(screen.getByRole("navigation", { name: "Features" })).getAllByRole("link").map((l) => l.textContent);

describe("the feature tabs", () => {
  it("are Home, Bosses, Checklist and two TBD tabs, then the EXP table and Themes", () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    expect(tabNames()).toEqual(["Home", "Bosses", "Checklist", "TBD", "TBD", "EXP table", "Themes"]);
  });

  it("each opens its page, and only its own tab is marked as current", async () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    const nav = within(screen.getByRole("navigation", { name: "Features" }));
    const pages: [string, number, string][] = [
      ["EXP table", 0, "EXP table (GMS)"],
      ["Themes", 0, "Themes"],
      ["TBD", 1, "TBD"],
      ["Bosses", 0, "Bosses"],
      ["Checklist", 0, "Checklist"],
      ["Home", 0, "Home"],
    ];
    for (const [label, index, heading] of pages) {
      const tab = nav.getAllByRole("link", { name: label })[index]!;
      await userEvent.click(tab);
      expect(screen.getByRole("heading", { level: 1 })).toHaveProperty("textContent", heading);
      expect(nav.getAllByRole("link").filter((l) => l.classList.contains("active"))).toEqual([tab]);
    }
  });

  it("each shows an icon", () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    const links = within(screen.getByRole("navigation", { name: "Features" })).getAllByRole("link");
    expect(links.map((l) => l.querySelectorAll("svg").length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("go to the right addresses", () => {
    fakeServer(BASE_ROUTES);
    renderWithApp(<App />);
    const hrefs = within(screen.getByRole("navigation", { name: "Features" })).getAllByRole("link").map((l) => l.getAttribute("href"));
    expect(hrefs).toEqual(["/", "/bosses", "/checklist", "/tbd/3", "/tbd/4", "/exp-table", "/themes"]);
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
      ["/exp-table", "EXP table (GMS)"],
      ["/themes", "Themes"],
    ]) {
      const { unmount } = renderWithApp(<App />, path);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(heading);
      unmount();
    }
  });
});

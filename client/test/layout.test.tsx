import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { slideToFit } from "../src/lib/layout";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

describe("slideToFit", () => {
  const area = { left: 200, right: 1300 };

  it("doesn't move a box that fits", () => {
    expect(slideToFit({ left: 230, right: 570 }, area)).toBe(0);
    expect(slideToFit({ left: 960, right: 1300 }, area)).toBe(0); // touching the right edge still fits
  });

  it("slides a box sticking out on the right back inside, exactly", () => {
    expect(slideToFit({ left: 1130, right: 1470 }, area)).toBe(170);
  });

  it("never slides it past the left edge (a box wider than the room keeps its left edge)", () => {
    expect(slideToFit({ left: 260, right: 1400 }, area)).toBe(60);
    expect(slideToFit({ left: 200, right: 1400 }, area)).toBe(0);
  });
});

describe("the + box on the page", () => {
  // jsdom can't lay out a page, so the sizes are made up: the section and where the box opens.
  function sizes(box: { left: number; right: number }) {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const r = this.classList.contains("popover") ? box : this.classList.contains("block") ? { left: 200, right: 1300 } : { left: 0, right: 0 };
      return { ...r, top: 0, bottom: 0, width: r.right - r.left, height: 0, x: r.left, y: 0, toJSON: () => r } as DOMRect;
    });
  }

  it("stays where it opens (below the +) when it fits", async () => {
    fakeServer(BASE_ROUTES);
    sizes({ left: 230, right: 570 });
    renderWithApp(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Add a character" }));
    expect(screen.getByRole("dialog").style.transform).toBe("translateX(-0px)");
  });

  it("measures again when a result makes it wider", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /search": { name: "NewOne", worldId: 45, level: 250, exp: 1, expToNext: 2, job: "Hero", worldRank: 1, overallRank: 1, legion: null, avatar: null } });
    // Without a result it fits; with one (wider) it sticks out 120 px past the section's right edge.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const wide = !!this.querySelector?.(".found");
      const r = this.classList.contains("popover") ? { left: 230, right: wide ? 1420 : 570 } : this.classList.contains("block") ? { left: 200, right: 1300 } : { left: 0, right: 0 };
      return { ...r, top: 0, bottom: 0, width: r.right - r.left, height: 0, x: r.left, y: 0, toJSON: () => r } as DOMRect;
    });
    renderWithApp(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Add a character" }));
    expect(screen.getByRole("dialog").style.transform).toBe("translateX(-0px)");
    await userEvent.type(screen.getByRole("textbox", { name: "Character name" }), "NewOne{Enter}");
    await screen.findByText("NewOne");
    expect(screen.getByRole("dialog").style.transform).toBe("translateX(-30px)"); // min(1420 − 1300, 230 − 200)
  });

  it("measures again from where it would be without sliding (an earlier slide doesn't count)", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /search": { name: "NewOne", worldId: 45, level: 250, exp: 1, expToNext: 2, job: "Hero", worldRank: 1, overallRank: 1, legion: null, avatar: null } });
    // Like a real browser: the box's measured position includes its current slide.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const slid = Number(/translateX\(-(\d+)px\)/.exec((this as HTMLElement).style?.transform ?? "")?.[1] ?? 0);
      const wide = !!this.querySelector?.(".found");
      const r = this.classList.contains("popover")
        ? { left: 1260 - slid, right: (wide ? 1840 : 1320) - slid } // sticks out 20 px without a result, 540 px with one
        : this.classList.contains("block")
          ? { left: 200, right: 1300 }
          : { left: 0, right: 0 };
      return { ...r, top: 0, bottom: 0, width: r.right - r.left, height: 0, x: r.left, y: 0, toJSON: () => r } as DOMRect;
    });
    renderWithApp(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Add a character" }));
    expect(screen.getByRole("dialog").style.transform).toBe("translateX(-20px)");
    await userEvent.type(screen.getByRole("textbox", { name: "Character name" }), "NewOne{Enter}");
    await screen.findByText("NewOne");
    expect(screen.getByRole("dialog").style.transform).toBe("translateX(-540px)"); // min(1840 − 1300, 1260 − 200), measured unslid
  });

  it("slides left to stay inside its section when the + is near the right edge", async () => {
    fakeServer(BASE_ROUTES);
    sizes({ left: 1130, right: 1470 });
    renderWithApp(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Add a character" }));
    expect(screen.getByRole("dialog").style.transform).toBe("translateX(-170px)");
  });
});

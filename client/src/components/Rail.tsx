import { type ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { BossIcon, ChecklistIcon, GearIcon, HomeIcon, SymbolIcon, TableIcon, ThemesIcon } from "./icons";

export interface Tab {
  path: string;
  label: string;
  icon: ReactNode;
  pages?: { path: string; label: string }[]; // a group: its own pages, listed under it
}

// Home and the features at the top; the reference pages at the bottom.
export const TOP_TABS: Tab[] = [
  // Stryker disable next-line StringLiteral: the rail sits outside the page routes, so an empty link also means the root
  { path: "/", label: "Home", icon: <HomeIcon /> },
  { path: "/bosses", label: "Bosses", icon: <BossIcon /> },
  { path: "/checklist", label: "Checklist", icon: <ChecklistIcon /> },
  { path: "/symbols", label: "Symbols", icon: <SymbolIcon /> },
  {
    path: "/gear",
    label: "Gear",
    icon: <GearIcon />,
    pages: [
      { path: "/gear", label: "Equipment" },
      { path: "/gear/flames", label: "Flames" },
      { path: "/gear/starforce", label: "Star Force" },
      { path: "/gear/potential", label: "Potential" },
      { path: "/gear/upgrades", label: "Upgrades" },
    ],
  },
];
export const BOTTOM_TABS: Tab[] = [
  { path: "/exp-table", label: "EXP table", icon: <TableIcon /> },
  { path: "/themes", label: "Themes", icon: <ThemesIcon /> },
];

const link = (t: Tab) => (
  <NavLink key={t.path} to={t.path} end className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
    {t.icon}
    {t.label}
  </NavLink>
);

// A group (Gear): the tab goes to its first page; its pages are listed under it while one of them is
// open. On a narrow window (the rail along the bottom) they open as a small menu above the bar
// instead, from the tab: there, pressing the tab while already in the group only opens the menu.
const narrow = () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches;
function Group({ t }: { t: Tab & { pages: NonNullable<Tab["pages"]> } }) {
  const { pathname } = useLocation();
  const inside = pathname === t.path || pathname.startsWith(`${t.path}/`);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!inside) setMenu(false);
  }, [inside]);
  return (
    <div className={`rail-group${inside ? " inside" : ""}${menu ? " menu" : ""}`}>
      <NavLink
        to={t.path}
        className={`tab${inside ? " open" : ""}`}
        aria-expanded={inside}
        onClick={(e) => {
          if (!narrow()) return;
          if (inside) e.preventDefault();
          setMenu((m) => !m);
        }}
      >
        {t.icon}
        <span>
          {t.label} <span className="caret" aria-hidden="true">▾</span>
        </span>
      </NavLink>
      <div className="rail-pages" role="group" aria-label={`${t.label} pages`}>
        {t.pages.map((p) => (
          <NavLink key={p.path} to={p.path} end className={({ isActive }) => `rail-page${isActive ? " active" : ""}`} onClick={() => setMenu(false)}>
            {p.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

const entry = (t: Tab) => (t.pages ? <Group key={t.path} t={{ ...t, pages: t.pages }} /> : link(t));

export function Rail() {
  return (
    <nav className="rail" aria-label="Features">
      <div className="rail-brand" title="MikuTracker" />
      {TOP_TABS.map(entry)}
      <div className="rail-spacer" />
      {BOTTOM_TABS.map(link)}
    </nav>
  );
}

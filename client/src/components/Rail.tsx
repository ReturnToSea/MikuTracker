import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { BossIcon, ChecklistIcon, GearIcon, HomeIcon, SymbolIcon, TableIcon, ThemesIcon } from "./icons";

export interface Tab {
  path: string;
  label: string;
  icon: ReactNode;
}

// Home and the features at the top; the reference pages at the bottom.
export const TOP_TABS: Tab[] = [
  // Stryker disable next-line StringLiteral: the rail sits outside the page routes, so an empty link also means the root
  { path: "/", label: "Home", icon: <HomeIcon /> },
  { path: "/bosses", label: "Bosses", icon: <BossIcon /> },
  { path: "/checklist", label: "Checklist", icon: <ChecklistIcon /> },
  { path: "/symbols", label: "Symbols", icon: <SymbolIcon /> },
  { path: "/gear", label: "Gear", icon: <GearIcon /> },
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

export function Rail() {
  return (
    <nav className="rail" aria-label="Features">
      <div className="rail-brand" title="MikuTracker" />
      {TOP_TABS.map(link)}
      <div className="rail-spacer" />
      {BOTTOM_TABS.map(link)}
    </nav>
  );
}

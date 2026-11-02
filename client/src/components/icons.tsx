// The tab icons (drawn in the text color, so they follow the theme).
const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const HomeIcon = () => (
  <svg {...common}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </svg>
);

export const BossIcon = () => (
  <svg {...common}>
    <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
    <path d="M13 19l6-6" />
    <path d="M16 16l4 4" />
    <path d="M19 21l2-2" />
    <path d="M9.5 6.5L18 3h3v3l-3.5 8.5" />
    <path d="M5 14l4 4" />
    <path d="M7 17l-3 3" />
    <path d="M3 19l2 2" />
  </svg>
);

export const ChecklistIcon = () => (
  <svg {...common}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <path d="M8.5 10l1.5 1.5L13 8.5" />
    <path d="M8.5 16l1.5 1.5L13 14.5" />
    <path d="M15 10h1" />
    <path d="M15 16h1" />
  </svg>
);

export const SymbolIcon = () => (
  <svg {...common}>
    <path d="M12 3l7 4v10l-7 4-7-4V7z" />
    <path d="M12 8l3 2v4l-3 2-3-2v-4z" />
  </svg>
);

// Three hexagons: the HEXA Matrix (6th job).
export const HexaIcon = () => (
  <svg {...common}>
    <path d="M8 3l3.5 2v4L8 11 4.5 9V5z" />
    <path d="M16 3l3.5 2v4L16 11l-3.5-2V5z" />
    <path d="M12 12l3.5 2v4L12 20l-3.5-2v-4z" />
  </svg>
);

// A paw: the Familiars page.
export const FamiliarIcon = () => (
  <svg {...common}>
    <ellipse cx="12" cy="16" rx="4.5" ry="3.5" />
    <circle cx="6" cy="10" r="1.8" />
    <circle cx="9.5" cy="6" r="1.8" />
    <circle cx="14.5" cy="6" r="1.8" />
    <circle cx="18" cy="10" r="1.8" />
  </svg>
);

// A helmet: the gear tab.
export const GearIcon = () => (
  <svg {...common}>
    <path d="M4 15a8 8 0 0 1 16 0v3H4z" />
    <path d="M12 7v5" />
    <path d="M4 15h6l2 3 2-3h6" />
  </svg>
);

export const TbdIcon = () => (
  <svg {...common}>
    <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7" />
    <circle cx="12" cy="17" r=".6" fill="currentColor" />
  </svg>
);

export const TableIcon = () => (
  <svg {...common}>
    <path d="M4 20V10" />
    <path d="M10 20V6" />
    <path d="M16 20v-8" />
    <path d="M22 20H2" />
    <path d="M20 20V3" />
  </svg>
);

export const ThemesIcon = () => (
  <svg {...common}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.4-9-7.4z" />
    <circle cx="7.5" cy="11.5" r="1.2" fill="currentColor" />
    <circle cx="10" cy="7.5" r="1.2" fill="currentColor" />
    <circle cx="14.5" cy="7.5" r="1.2" fill="currentColor" />
  </svg>
);

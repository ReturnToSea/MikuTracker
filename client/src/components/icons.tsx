// The tab icons (drawn in the text color, so they follow the theme).
const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const HomeIcon = () => (
  <svg {...common}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
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

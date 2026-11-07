/**
 * Design tokens — single source of truth. Scales derived in OKLab from the brand anchors
 * (forest green #0B5D3B = green-700, gold #D4AF37 = gold-400, deep black #090D0B).
 * Every text/background pair is contrast-tested (test/unit/contrast.test.ts) and recorded
 * in docs/DESIGN.md. Gold #D4AF37 is NEVER used as text on light backgrounds (2.10:1).
 */
export const scales = {
  green: { 50: "#DBFFEA", 100: "#CCF3DC", 200: "#B6E0C7", 300: "#99C7AC", 400: "#79AC8F", 500: "#589272", 600: "#3C7B5A", 700: "#0B5D3B", 800: "#004E2E", 900: "#00371B", 950: "#002209" },
  gold: { 50: "#FFF7D1", 100: "#FFEDAA", 200: "#F3D16D", 300: "#DBB745", 400: "#D4AF37", 500: "#A07F00", 600: "#866800", 700: "#6D5100", 800: "#563B00", 900: "#3F2600", 950: "#291300" },
  neutral: { 50: "#F4F7F5", 100: "#E7ECE9", 200: "#D2D9D5", 300: "#B5BDB9", 400: "#8E9792", 500: "#6B7470", 600: "#555D59", 700: "#424945", 800: "#2C3330", 900: "#1A201D", 950: "#090D0B" },
} as const;

export type ThemeName = "light" | "dark";

export const semantic: Record<ThemeName, Record<string, string>> = {
  light: {
    bg: "#FFFFFF",
    surface: "#F4F7F5",
    "surface-2": "#E7ECE9",
    text: "#090D0B",
    muted: "#424945",
    border: "#D2D9D5",          // decorative dividers/cards only
    "border-strong": "#6B7470", // input & control boundaries (≥3:1)
    primary: "#0B5D3B",
    "primary-hover": "#004E2E",
    "on-primary": "#FFFFFF",
    "primary-text": "#0B5D3B",
    accent: "#D4AF37",          // non-text only in light mode (badges with dark text, focus ring, bars)
    "on-accent": "#090D0B",
    "accent-text": "#6D5100",   // darker gold for text on light backgrounds
    success: "#0B5D3B",
    warning: "#7A4A00",
    danger: "#B42318",
    info: "#1F5A96",
    focus: "#0B5D3B",
    "demo-bg": "#FFEDAA",
    "demo-text": "#563B00",
  },
  dark: {
    bg: "#090D0B",
    surface: "#121815",
    "surface-2": "#1A201D",
    text: "#F2F5F3",
    muted: "#B5BDB9",
    border: "#2C3330",
    "border-strong": "#8E9792",
    primary: "#79AC8F",
    "primary-hover": "#99C7AC",
    "on-primary": "#090D0B",
    "primary-text": "#99C7AC",
    accent: "#D4AF37",
    "on-accent": "#090D0B",
    "accent-text": "#DBB745",
    success: "#99C7AC",
    warning: "#F3D16D",
    danger: "#FF8A80",
    info: "#8CC2FF",
    focus: "#D4AF37",
    "demo-bg": "#3F2600",
    "demo-text": "#FFEDAA",
  },
};

/** Text/background pairs actually used in the UI; each must meet its minimum ratio. */
export const contrastPairs: { fg: string; bg: string; min: number; use: string }[] = [
  ...(["bg", "surface", "surface-2"] as const).flatMap((bg) => [
    { fg: "text", bg, min: 4.5, use: "body text" },
    { fg: "muted", bg, min: 4.5, use: "secondary text" },
    { fg: "primary-text", bg, min: 4.5, use: "links" },
    { fg: "accent-text", bg, min: 4.5, use: "gold emphasis text" },
    { fg: "danger", bg, min: 4.5, use: "error text" },
    { fg: "warning", bg, min: 4.5, use: "warning text" },
    { fg: "info", bg, min: 4.5, use: "info text" },
    { fg: "success", bg, min: 4.5, use: "success text" },
    { fg: "border-strong", bg, min: 3, use: "input/control borders (non-text)" },
    { fg: "focus", bg, min: 3, use: "focus ring (non-text)" },
  ]),
  { fg: "on-primary", bg: "primary", min: 4.5, use: "primary button label" },
  { fg: "on-primary", bg: "primary-hover", min: 4.5, use: "primary button hover label" },
  { fg: "on-accent", bg: "accent", min: 4.5, use: "gold badge label" },
  { fg: "demo-text", bg: "demo-bg", min: 4.5, use: "DEMO DATA badge" },
  { fg: "primary", bg: "bg", min: 3, use: "primary button boundary vs page (non-text)" },
];

function channel(c: number) { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

export function themeCss(): string {
  const vars = (t: ThemeName) => Object.entries(semantic[t]).map(([k, v]) => `--c-${k}:${v};`).join("");
  const scaleVars = Object.entries(scales).flatMap(([name, s]) => Object.entries(s).map(([k, v]) => `--${name}-${k}:${v};`)).join("");
  return `:root{${scaleVars}${vars("light")}color-scheme:light}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars("dark")}color-scheme:dark}}` +
    `:root[data-theme="dark"]{${vars("dark")}color-scheme:dark}:root[data-theme="light"]{${vars("light")}color-scheme:light}`;
}

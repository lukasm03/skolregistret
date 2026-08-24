/**
 * The canvas colour of each appearance, matching `--canvas` in `globals.css`.
 * The browser's own chrome — the address bar on mobile, the tab strip on
 * desktop — takes its colour from this, via the `theme-color` meta pair in
 * `layout.tsx` that follows `prefers-color-scheme`.
 */
export const THEME_CANVAS: Record<"light" | "dark", string> = {
  light: "#edede9",
  dark: "#0e1013",
};

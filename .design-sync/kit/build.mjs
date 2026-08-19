// Compiles the app's real Tailwind v4 stylesheet -> dist/styles.css. The JS
// entry (entry.tsx) is NOT pre-bundled here — design-sync's own converter
// bundles straight from the .tsx source (via cfg.entry + cfg.tsconfig), so
// its react/react-dom shim redirect can catch every import site, including
// nested CJS `require("react")` calls (e.g. @tanstack/react-table's
// use-sync-external-store shim) that break if react is pre-externalized.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const KIT = dirname(new URL(import.meta.url).pathname);
const REPO = resolve(KIT, "../..");

mkdirSync(resolve(KIT, "dist"), { recursive: true });
const css = readFileSync(resolve(REPO, "src/app/globals.css"), "utf8");
const result = await postcss([tailwindcss({ base: REPO })]).process(css, {
  from: resolve(REPO, "src/app/globals.css"),
  to: resolve(KIT, "dist/styles.css"),
});
writeFileSync(resolve(KIT, "dist/styles.css"), result.css);
console.error(`[kit] compiled dist/styles.css (${result.css.length} bytes)`);

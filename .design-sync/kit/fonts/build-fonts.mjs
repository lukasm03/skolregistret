// Extracts the latin subset from the fetched Google Fonts CSS, downloads the
// woff2 files locally, and rewrites the stylesheet to reference them plus
// define the --font-instrument-sans / --font-plex-mono custom properties
// src/app/globals.css expects (next/font/google supplies these at runtime
// in the real app; nothing here does, so the kit provides them statically).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DIR = dirname(new URL(import.meta.url).pathname);
const raw = readFileSync(resolve(DIR, "google-fonts.css"), "utf8");

const blocks = raw.split(/\n(?=\/\* )/).filter((b) => /\/\* latin \*\//.test(b));

let out = "";
for (const block of blocks) {
  const urlMatch = block.match(/url\((https:[^)]+\.woff2)\)/);
  const familyMatch = block.match(/font-family:\s*'([^']+)'/);
  const weightMatch = block.match(/font-weight:\s*(\d+)/);
  if (!urlMatch || !familyMatch || !weightMatch) continue;
  const url = urlMatch[1];
  const family = familyMatch[1];
  const weight = weightMatch[1];
  const filename = `${family.replace(/\s+/g, "-").toLowerCase()}-${weight}.woff2`;
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(resolve(DIR, filename), buf);
  console.error(`[fonts] ${filename} (${buf.length} bytes)`);
  out += block.replace(urlMatch[0], `url(./${filename})`) + "\n";
}

const header = `:root {
  --font-instrument-sans: "Instrument Sans", system-ui, sans-serif;
  --font-plex-mono: "IBM Plex Mono", ui-monospace, monospace;
}

`;
writeFileSync(resolve(DIR, "fonts.css"), header + out);
console.error("[fonts] wrote fonts.css");

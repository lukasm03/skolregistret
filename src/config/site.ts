/**
 * Central app configuration. Change scope (kommun, läsår), labels, page sizes
 * and sort options here — the pages read everything from this file.
 *
 * Skolformer and their measures live in `src/config/skolformer.ts`; the filter
 * chips, columns and comparisons are generated from that registry.
 */

export const site = {
  brand: "Skolregistret",

  /**
   * Absolute origin the site is served from. Everything that must emit a
   * full URL resolves against this: `metadataBase` (canonical + Open Graph),
   * `robots.txt`'s sitemap pointer and every `<loc>` in `sitemap.xml`.
   * `NEXT_PUBLIC_SITE_URL` overrides it where the site is actually deployed;
   * the localhost default keeps local runs honest rather than pointing at a
   * domain that isn't ours.
   */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",

  /** Läsår the views prefer when a metric reports several. */
  period: "2025/26",

  /** Shown wherever no kommun is selected — the school list covers riket. */
  riket: "Hela riket",
  /** Label of the "no kommun" option in the kommun dropdown. */
  allaKommuner: "Alla kommuner",

  /** Placeholder value shown when a figure is not reported. */
  dash: "—",

  nav: [
    { href: "/skolor", label: "Skolenheter", match: "/skolor" },
    { href: "/huvudman", label: "Huvudmän", match: "/huvudman" },
    { href: "/koncern", label: "Koncerner", match: "/koncern" },
  ],

  search: {
    skolor: "Sök skolenhetsnamn…",
    huvudman: "Sök huvudman eller org.nr…",
    koncern: "Sök koncernnamn eller org.nr…",
  },

  /** Label for the "no skolform selected" state. */
  allaSkolformer: "Alla skolformer",

  pagination: {
    perPage: 20,
    perPageOptions: [20, 50, 100],
  },

  elevRange: { min: 0, max: 1200 },

  footnotes: {
    elevantal:
      "Elevantal är avrundade av Skolverket. Låga värden redovisas inte. Fritidshem räknas inte in — dess elever ingår redan i grundskolan.",
    bolagsdata: "Bolagsuppgifter kommer från Bolagsverket, inte från skol-API:t.",
  },

  /** Shown in the small print of the detail rails. */
  freshness: {
    huvudman: "bolagsdata hämtad 2026-08-05",
  },
} as const;

/** Sorts that apply whatever skolform is selected. Metric sorts are appended
 *  per skolform in `src/lib/query.ts`. */
/** `key` is also the table column the sort applies to, and `desc` its
 *  natural direction — the one the toolbar's label describes. */
export const baseSchoolSorts = [
  { key: "name", label: "Namn A–Ö", desc: false },
  { key: "elever", label: "Elever, flest först", desc: true },
] as const;

export const baseHuvudmanSorts = [
  { key: "elever", label: "Elever, flest först", desc: true },
  { key: "name", label: "Namn A–Ö", desc: false },
  { key: "enheter", label: "Enheter, flest först", desc: true },
] as const;

export const baseKoncernSorts = [
  { key: "elever", label: "Elever, flest först", desc: true },
  { key: "namn", label: "Namn A–Ö", desc: false },
  { key: "enheter", label: "Enheter, flest först", desc: true },
] as const;

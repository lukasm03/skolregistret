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

  /**
   * Where every figure on a detail page actually came from.
   *
   * The detail pages' "Källor" disclosure is the only place source prose is
   * allowed to live — the tables under the tabs used to carry a caveat line
   * each, and the reader met the same three sources three times. A figure the
   * page colours must be able to say where it came from, so each row there
   * names its authority *and* links to it.
   *
   * What is here is the *name* and the source as a whole. The address of the
   * exact resource a page was built from is not — `data/allt.json` carries it
   * per unit and per bolag (`Skolinfo.kallor`, `Bolagsuppslag.kallor`), and
   * `SkolaKällhänvisning`/`HuvudmanKällhänvisning` bring it up to the Källor
   * rows, which link there in preference to `url` below. That is why an API
   * version bump does not touch this file: the collector's own answer travels
   * with the data.
   *
   * `url` is what a row falls back to when the data cites no address it can
   * open — and the name is what a row shows either way, because the authority
   * behind a figure is not always the API that serves it: Skolinspektionen
   * runs skolenkäten and publishes the dokument, and Skolverket's own API is
   * where both are read from.
   */
  källor: {
    skolenhetsregistret: {
      namn: "Skolverkets skolenhetsregister",
      url: "https://api.skolverket.se/skolenhetsregistret/",
    },
    skolverketStatistik: {
      namn: "Skolverkets statistik-API",
      url: "https://api.skolverket.se/planned-educations/",
    },
    salsa: {
      namn: "Skolverkets SALSA-modell",
      url: "https://www.skolverket.se/skolutveckling/statistik",
    },
    skolenkäten: {
      namn: "Skolinspektionens skolenkät",
      url: "https://www.skolinspektionen.se/skolenkaten/",
    },
    skolinspektionenDokument: {
      namn: "Skolinspektionens dokument-API",
      url: "https://www.skolinspektionen.se/",
    },
    bolagsverket: {
      namn: "Bolagsverket",
      url: "https://bolagsverket.se/",
    },
    /** Where the koncern ownership trees are looked up, company by company. */
    hitta: {
      namn: "Hitta.se företagsinformation",
      url: "https://www.hitta.se/",
    },
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

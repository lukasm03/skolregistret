/**
 * Pure helpers for reading `allt.json`'s raw shapes — casing, string parsing,
 * and the newest-value selection every `Statistik.matt` read needs. Kept
 * separate from `resources.ts` (which decides *which* record to read) and
 * `api-normalize.ts` (which only ever sees this module's stable output
 * types, never `allt.json`'s own shapes) so both stay free of `allt.json`'s
 * particular quirks.
 */

import type { Matvarde } from "./types";

/**
 * The newest `Matvarde` in a time series. Read by `period`, not array
 * position — the source documents "newest first" but series length varies
 * (one entry for some measures, five for others), so position isn't a safe
 * assumption to lean on.
 */
export function nyastaMatvärde(serie: Matvarde[] | undefined): Matvarde | null {
  if (!serie || serie.length === 0) return null;
  const medPeriod = serie.filter((m) => m.period != null);
  if (medPeriod.length === 0) return serie[0] ?? null;
  return [...medPeriod].sort((a, b) => (b.period! > a.period! ? 1 : -1))[0]!;
}

/** Type guard for a `Matvarde` that actually has a number. */
export function finns(
  m: Matvarde | null,
): m is Matvarde & { typ: "EXISTS"; tal: number } {
  return m != null && m.typ === "EXISTS" && m.tal != null;
}

/**
 * The single number a `Matvarde` carries. This is the only place in the
 * codebase that should read `.tal` — never `.varde`, which is the register's
 * own text and can be rounded ("cirka 10") without `tal` showing it.
 */
export function talAv(m: Matvarde | null): number | null {
  return finns(m) ? m.tal : null;
}

/** Convenience: newest value's `tal`, straight from a time series. */
export function nyastaTal(serie: Matvarde[] | undefined): number | null {
  return talAv(nyastaMatvärde(serie));
}

/**
 * `karta`/`enskilda` spell skolformskoder in versaler ("FSK","GR");
 * `skolinfo`/`offentliga`/`grund` spell them in gemener ("fsk","gr"). This is
 * the one place that difference gets normalised away — always to gemener,
 * since that's what `skolform.ts` and `Skolinfo` already use.
 */
export function normaliseraSkolformskod(kod: string): string {
  return kod.toLowerCase();
}

/**
 * Skolformskod → the exact label string `src/config/skolformer.ts` declares,
 * so `api-normalize.ts`'s existing label-matching logic (`skolformCodeFromLabel`)
 * keeps working unchanged. Built here rather than trusting the source's own
 * `grund.skolformer[].namn` — that field disagrees with `skolformer.ts` in
 * places (e.g. "Grundskolan" vs. "Grundskola") and matching against it would
 * silently drop schools into `otherForms`.
 */
const SKOLFORMSKOD_TILL_LABEL: Record<string, string> = {
  fsk: "Förskoleklass",
  gr: "Grundskola",
  gran: "Anpassad grundskola",
  sp: "Specialskola",
  sam: "Sameskola",
  gy: "Gymnasieskola",
  gyan: "Anpassad gymnasieskola",
  vuxgr: "Komvux",
  vuxgran: "Komvux",
  vuxgy: "Komvux",
  vuxgyan: "Komvux",
  sfi: "Komvux",
};

export function skolformLabel(kod: string): string {
  const gemener = normaliseraSkolformskod(kod);
  return SKOLFORMSKOD_TILL_LABEL[gemener] ?? kod;
}

/**
 * `"57%"` → `57`, `"-"` (maskerad) → `null`, missing/`null` (frågan inte
 * ställd) → `null`. Callers that must tell "maskerad" and "inte ställd" apart
 * for display text should read the raw string themselves rather than use
 * this — it exists for the numeric `svarsfördelning`/`svarsfrekvens` reads,
 * where both cases mean the same thing: no number.
 */
export function parseAndelString(s: string | null | undefined): number | null {
  if (s == null || s === "-") return null;
  const tal = Number(s.replace("%", "").replace(",", "."));
  return Number.isFinite(tal) ? tal : null;
}

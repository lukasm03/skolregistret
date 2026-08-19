/**
 * Which skolform's statistics a given nyckeltal should be compared against.
 * Small, but the two constants below encode a non-obvious rule that both the
 * detail page and `statistics.ts` depend on — worth keeping in one named place.
 */

import type { Nyckeltal, Skolform } from "./types";

/**
 * meritvärde/andelGodkända always come from grundskolans egen statistik
 * (`byggSkoldetalj` reads them off `statistik.get("gr")` specifically, never
 * off whichever skolform happens to be first) — so their riksgenomsnitt is
 * always the "gr" endpoint/bucket, regardless of what else the unit runs.
 */
export const GRUNDSKOLA_NYCKELTAL: (keyof Nyckeltal)[] = [
  "meritvärdeÅrskurs9",
  "andelGodkändaÅrskurs9",
];

/**
 * andelBehöriga/eleverPerLärare, on the other hand, come off whichever
 * skolform's statistik the register found first for the unit — so the
 * comparable riksgenomsnitt is that same skolform's. Gymnasieskola ("gy")
 * has no skolform-level riksgenomsnitt endpoint at Skolverket (only a
 * per-program one), so a unit whose first skolform is "gy" never gets an
 * *official* figure for these two — but `getBeräknatRiksGenomsnitt` in
 * `statistics.ts` still buckets it under "gy" and computes one from every
 * gymnasieskola's own reported values.
 */
export const SKOLFORM_TILL_STATISTIKNYCKEL: Record<string, Skolform> = {
  Förskoleklass: "fsk",
  Grundskola: "gr",
  "Anpassad grundskola": "gran",
  Gymnasieskola: "gy",
  "Anpassad gymnasieskola": "gyan",
};

/**
 * The same five forms written out, for the sentence that names which skolform
 * a figure was read from — "Skolverkets statistik-API (grundskola)". Lower
 * case: it lands mid-sentence, never as a heading.
 */
export const STATISTIKNYCKEL_NAMN: Record<Skolform, string> = {
  fsk: "förskoleklass",
  gr: "grundskola",
  gran: "anpassad grundskola",
  gy: "gymnasieskola",
  gyan: "anpassad gymnasieskola",
};

export function primärStatistikskolform(skolformer: string[]): Skolform | null {
  for (const namn of skolformer) {
    const nyckel = SKOLFORM_TILL_STATISTIKNYCKEL[namn];
    if (nyckel) return nyckel;
  }
  return null;
}

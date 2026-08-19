import type { Nyckeltal } from "@/lib/skolregister";

/**
 * The four unit-level nyckeltal the detail page compares against kommunen and
 * riket, in the order they are shown. A sibling of `programmetriker.ts`: that
 * registry describes one gymnasieprogram's measures, these describe the
 * skolenhet's own.
 *
 * `domain` scales the comparison band — the track the unit's own figure fills
 * and the kommun/riks ticks sit on. It is never drawn as an axis, but it *is*
 * printed under the band ("skala 0–100%"), so it has to be a range a reader
 * can believe: wide enough to hold what the register actually reports for the
 * measure across every skolform, narrow enough that ordinary differences are
 * visible. Figures outside it pin to the ends.
 *
 * `mått` and `förklaring` are the provenance disclosure behind each figure —
 * what the number counts and what it does not say. They are the reason the
 * page can show a colour at all without it reading as a grade.
 */
export interface NyckeltalMetrik {
  key: keyof Nyckeltal;
  label: string;
  /** What the figure counts, in the "Varifrån kommer talet?" panel. */
  mått: string;
  /** Appended to every figure of this measure, including the averages. */
  suffix: string;
  domain: [number, number];
  /**
   * Never `null` here, unlike `ProgramMetrik`: all four of these have a
   * direction the register itself ranks on — see `NYCKELTAL_BÄTTRE_RIKTNING`
   * in `lib/skolregister/statistics.ts`, which this has to agree with.
   */
  higherIsBetter: boolean;
  förklaring: string;
}

export const nyckeltalmetriker: NyckeltalMetrik[] = [
  {
    key: "meritvärdeÅrskurs9",
    label: "Meritvärde, årskurs 9",
    mått: "Genomsnittligt meritvärde, 17 ämnen",
    suffix: "",
    domain: [150, 320],
    higherIsBetter: true,
    förklaring:
      "Meritvärdet är summan av elevens 17 bästa betyg. Skolverket redovisar " +
      "inte tal för grupper som är för små för att en enskild elev ska förbli " +
      "anonym.",
  },
  {
    key: "andelGodkändaÅrskurs9",
    label: "Andel godkända, årskurs 9",
    mått: "Andel elever med godkänt i alla ämnen",
    suffix: "%",
    domain: [0, 100],
    higherIsBetter: true,
    förklaring:
      "Räknas på de elever som fått betyg. En elev som saknar betyg i ett " +
      "ämne räknas som icke godkänd.",
  },
  {
    key: "andelBehörigaLärare",
    label: "Andel behöriga lärare",
    mått: "Lärare med legitimation och behörighet i minst ett ämne",
    suffix: "%",
    domain: [0, 100],
    higherIsBetter: true,
    förklaring:
      "Räknas på heltidstjänster, inte på personer. Andelen skiljer sig " +
      "kraftigt mellan skolformer, och därför jämförs enheten mot sin egen.",
  },
  {
    key: "eleverPerLärare",
    label: "Elever per lärare",
    mått: "Elever per lärare, omräknat till heltidstjänster",
    suffix: "",
    domain: [0, 22],
    higherIsBetter: false,
    förklaring:
      "Färre elever per lärare är inte automatiskt bättre — talet påverkas av " +
      "skolans storlek, årskurser och andel elever med särskilt stöd.",
  },
];

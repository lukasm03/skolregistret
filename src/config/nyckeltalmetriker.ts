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
 */
export interface NyckeltalMetrik {
  key: keyof Nyckeltal;
  label: string;
  /** Appended to every figure of this measure, including the averages. */
  suffix: string;
  domain: [number, number];
  /**
   * Never `null` here, unlike `ProgramMetrik`: all four of these have a
   * direction the register itself ranks on — see `NYCKELTAL_BÄTTRE_RIKTNING`
   * in `lib/skolregister/statistics.ts`, which this has to agree with.
   */
  higherIsBetter: boolean;
}

export const nyckeltalmetriker: NyckeltalMetrik[] = [
  {
    key: "meritvärdeÅrskurs9",
    label: "Meritvärde, årskurs 9",
    suffix: "",
    domain: [150, 320],
    higherIsBetter: true,
  },
  {
    key: "andelGodkändaÅrskurs9",
    label: "Andel godkända, årskurs 9",
    suffix: "%",
    domain: [0, 100],
    higherIsBetter: true,
  },
  {
    key: "andelBehörigaLärare",
    label: "Andel behöriga lärare",
    suffix: "%",
    domain: [0, 100],
    higherIsBetter: true,
  },
  {
    key: "eleverPerLärare",
    label: "Elever per lärare",
    suffix: "",
    domain: [0, 22],
    higherIsBetter: false,
  },
];

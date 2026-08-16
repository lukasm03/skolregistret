import type { ProgramNyckeltalKey } from "@/lib/skolregister";

/**
 * The six measures the gymnasieprogram table compares against riket, in the
 * order they are shown. A sibling of `skolformer.ts`: that registry describes
 * a skolform's own statistics, these describe one programme's.
 *
 * `domain` exists only to scale the deviation bar in the expanded row. It is
 * never drawn as an axis and never shown, so it does not have to be the true
 * range of the measure — only wide enough that ordinary differences read as
 * ordinary. Widen one if its bars are pinned to the ends.
 */
export interface ProgramMetrik {
  key: ProgramNyckeltalKey;
  /** Written out, for the expanded comparison rows. */
  label: string;
  /** Column header — kept short enough for a table. */
  short: string;
  /** Decimals to use when we format a figure ourselves. */
  dec: 0 | 1;
  /** Bounds used to normalise the deviation bar. */
  domain: [number, number];
  /**
   * `null` means the measure has no better direction — elevantal and lägsta
   * antagningspoäng are facts about a programme, not marks out of ten. The
   * design's own table calls these "varken bra eller dåligt" and draws them in
   * plain ink, which is what `null` produces here.
   */
  higherIsBetter: boolean | null;
}

export const programmetriker: ProgramMetrik[] = [
  {
    key: "antalElever",
    label: "Elever",
    short: "Elever",
    dec: 0,
    domain: [0, 340],
    higherIsBetter: null,
  },
  {
    key: "lägstaAntagningspoäng",
    label: "Lägsta poäng",
    short: "Lägsta poäng",
    dec: 1,
    domain: [100, 240],
    higherIsBetter: null,
  },
  {
    key: "genomsnittligAntagningspoäng",
    label: "Medelpoäng",
    short: "Medelpoäng",
    dec: 1,
    domain: [180, 300],
    higherIsBetter: true,
  },
  {
    key: "andelMedExamenInom3År",
    label: "Examen 3 år",
    short: "Examen 3 år",
    dec: 1,
    domain: [0, 100],
    higherIsBetter: true,
  },
  {
    key: "betygspoängMedExamen",
    label: "Betygspoäng",
    short: "Betygspoäng",
    dec: 1,
    domain: [10, 20],
    higherIsBetter: true,
  },
  {
    key: "andelMedHögskolebehörighet",
    label: "Högsk.behörighet",
    short: "Högsk.behörighet",
    dec: 1,
    domain: [40, 100],
    higherIsBetter: true,
  },
];

/** The share of a metric's domain that a full-length deviation bar spans. */
export const DEVIATION_SPAN = 0.18;

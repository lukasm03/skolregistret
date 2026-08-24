import type { ProgramNyckeltalKey } from "@/lib/skolregister";

/**
 * The six measures the gymnasieprogram table compares against riket, in the
 * order they are shown. A sibling of `skolformer.ts`: that registry describes
 * a skolform's own statistics, these describe one programme's.
 *
 * `domain` normalises a difference against riket to [-1, 1] — `t` in
 * `program-compare.ts` — which is what the default row order averages into a
 * score. It is never drawn as an axis and never shown, so it does not have to
 * be the true range of the measure, only wide enough that ordinary
 * differences read as ordinary.
 */
export interface ProgramMetrik {
  key: ProgramNyckeltalKey;
  /** Column header — kept short enough to sit above a figure. */
  label: string;
  /**
   * What the column measures, on the header's `title`. The header is
   * abbreviated to fit the column, so this is the only place the measure is
   * spelled out — the same reason `nyckeltalmetriker.ts` keeps its prose.
   */
  hint: string;
  /** Decimals to use when we format a figure ourselves. */
  dec: 0 | 1;
  /** Bounds used to normalise the difference against riket. */
  domain: [number, number];
  /**
   * `null` means the measure has no better direction — elevantal and lägsta
   * antagningspoäng are facts about a programme, not marks out of ten. Those
   * are drawn in plain ink and print no difference against riket: "+64 elever"
   * is a fact about size, not about quality.
   */
  higherIsBetter: boolean | null;
}

export const programmetriker: ProgramMetrik[] = [
  {
    key: "antalElever",
    label: "Elever",
    hint: "Antal elever på programmet. Varken bra eller dåligt — säger bara hur stort det är.",
    dec: 0,
    domain: [0, 340],
    higherIsBetter: null,
  },
  {
    key: "lägstaAntagningspoäng",
    label: "Lägsta poäng",
    hint: "Lägsta meritvärde som antogs. Säger vad som krävdes, inte hur bra programmet är.",
    dec: 1,
    domain: [100, 240],
    higherIsBetter: null,
  },
  {
    key: "genomsnittligAntagningspoäng",
    label: "Medelpoäng",
    hint: "Genomsnittligt meritvärde bland antagna elever.",
    dec: 1,
    domain: [180, 300],
    higherIsBetter: true,
  },
  {
    key: "andelMedExamenInom3År",
    label: "Examen 3 år",
    hint: "Andel elever med examen inom tre år.",
    dec: 1,
    domain: [0, 100],
    higherIsBetter: true,
  },
  {
    key: "betygspoängMedExamen",
    label: "Betygspoäng",
    hint: "Genomsnittlig betygspoäng bland elever med examen.",
    dec: 1,
    domain: [10, 20],
    higherIsBetter: true,
  },
  {
    key: "andelMedHögskolebehörighet",
    label: "Behörighet",
    hint: "Andel elever med grundläggande högskolebehörighet.",
    dec: 1,
    domain: [40, 100],
    higherIsBetter: true,
  },
];

/** The share of a metric's domain that a full-length deviation spans. */
export const DEVIATION_SPAN = 0.18;

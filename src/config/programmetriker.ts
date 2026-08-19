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
/**
 * Which band of the table a measure belongs to. Six columns of figures read as
 * one undifferentiated wall; grouped under three spanning headers they read as
 * three questions — how big is it, what did it take to get in, what came out.
 */
export type ProgramGrupp = "storlek" | "antagning" | "resultat";

export const PROGRAM_GRUPPER: Record<ProgramGrupp, string> = {
  storlek: "Storlek",
  antagning: "Antagning",
  resultat: "Resultat",
};

export interface ProgramMetrik {
  key: ProgramNyckeltalKey;
  /** Written out, for the expanded comparison rows. */
  label: string;
  /** Column header — kept short enough for a table. */
  short: string;
  /** What the column measures, on the header's tooltip. */
  hint: string;
  grupp: ProgramGrupp;
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
    hint: "Antal elever på programmet. Varken bra eller dåligt — sorterar bara på storlek.",
    grupp: "storlek",
    dec: 0,
    domain: [0, 340],
    higherIsBetter: null,
  },
  {
    key: "lägstaAntagningspoäng",
    label: "Lägsta poäng",
    short: "Lägsta poäng",
    hint: "Lägsta meritvärde som antogs. Säger vad som krävdes, inte hur bra programmet är.",
    grupp: "antagning",
    dec: 1,
    domain: [100, 240],
    higherIsBetter: null,
  },
  {
    key: "genomsnittligAntagningspoäng",
    label: "Medelpoäng",
    short: "Medelpoäng",
    hint: "Genomsnittligt meritvärde bland antagna elever.",
    grupp: "antagning",
    dec: 1,
    domain: [180, 300],
    higherIsBetter: true,
  },
  {
    key: "andelMedExamenInom3År",
    label: "Examen 3 år",
    short: "Examen 3 år",
    hint: "Andel elever med examen inom tre år.",
    grupp: "resultat",
    dec: 1,
    domain: [0, 100],
    higherIsBetter: true,
  },
  {
    key: "betygspoängMedExamen",
    label: "Betygspoäng",
    short: "Betygspoäng",
    hint: "Genomsnittlig betygspoäng bland elever med examen.",
    grupp: "resultat",
    dec: 1,
    domain: [10, 20],
    higherIsBetter: true,
  },
  {
    key: "andelMedHögskolebehörighet",
    label: "Högsk.behörighet",
    short: "Högsk.behörighet",
    hint: "Andel elever med grundläggande högskolebehörighet.",
    grupp: "resultat",
    dec: 1,
    domain: [40, 100],
    higherIsBetter: true,
  },
];

/**
 * The spanning header row, derived from the metrics themselves so a new
 * measure lands under the right heading by declaring its `grupp` and nothing
 * else. Assumes the metrics are listed grouped, which they are.
 */
export const programgrupper: { grupp: ProgramGrupp; label: string; span: number }[] =
  programmetriker.reduce<{ grupp: ProgramGrupp; label: string; span: number }[]>(
    (grupper, m) => {
      const sist = grupper[grupper.length - 1];
      if (sist && sist.grupp === m.grupp) sist.span += 1;
      else grupper.push({ grupp: m.grupp, label: PROGRAM_GRUPPER[m.grupp], span: 1 });
      return grupper;
    },
    [],
  );

/** The share of a metric's domain that a full-length deviation bar spans. */
export const DEVIATION_SPAN = 0.18;

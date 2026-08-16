import {
  DEVIATION_SPAN,
  programmetriker,
  type ProgramMetrik,
} from "@/config/programmetriker";
import { DASH, dec, num } from "./format";
import type {
  NationelltProgramGenomsnitt,
  NyckeltalVärde,
  ProgramNyckeltalKey,
  SkolaProgram,
} from "./skolregister";

/**
 * One row per gymnasieprogram, with riket beside each figure rather than on a
 * second row of its own.
 *
 * The table used to render every programme twice — its own figures, then an
 * indented "Riksgenomsnitt" line — leaving the reader to hold two numbers in
 * their head and subtract. Here the comparison is computed once, and the table
 * shows the difference instead of the ingredients.
 *
 * Every difference is taken from the numbers the register reports, never from
 * the strings it renders: `text` may say "cirka 330", and parsing that back
 * would turn a rounded figure into an exact one. `text` is what gets shown;
 * `tal` is what gets compared.
 */

export interface ProgramMetricCell {
  metrik: ProgramMetrik;
  /** The register's own text for this school's figure. */
  text: string;
  tal: number | null;
  /** Riksgenomsnitt as text, `null` when neither source has one. */
  riksText: string | null;
  riksTal: number | null;
  /** School less riket. `null` when either side is missing. */
  diff: number | null;
  /**
   * `diff` normalised to [-1, 1] against the metric's domain, for the length
   * of the deviation bar. `null` when either side is missing.
   */
  t: number | null;
}

export interface ProgramComparison {
  kod: string;
  namn: string;
  /** Elevantal for the row's right-hand caption, already formatted. */
  elever: string;
  /** In `programmetriker` order — the table renders them positionally. */
  cells: ProgramMetricCell[];
  /**
   * Mean deviation across the measures that have a better direction and
   * figures on both sides. `null` when the programme has none, which is the
   * normal case for introduktionsprogram.
   */
  score: number | null;
}

export type ProgramSort = { key: ProgramNyckeltalKey; dir: "asc" | "desc" } | null;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The number behind a register value, or `null` when it reports none. */
function talOf(v: NyckeltalVärde | undefined): number | null {
  return v?.status === "finns" ? v.tal : null;
}

/**
 * Skolverket's own rounded string when its endpoint has one, otherwise the
 * average we computed across every unit running the programme — formatted
 * ourselves, since that one is not the register's own text.
 */
function riksOf(
  officiell: NyckeltalVärde | undefined,
  beräknat: number | undefined,
  metrik: ProgramMetrik,
): { text: string | null; tal: number | null } {
  if (officiell?.status === "finns") return { text: officiell.text, tal: officiell.tal };
  if (beräknat != null) {
    return { text: metrik.dec === 0 ? num(beräknat) : dec(beräknat), tal: beräknat };
  }
  return { text: null, tal: null };
}

function cell(
  metrik: ProgramMetrik,
  skola: NyckeltalVärde | undefined,
  riks: { text: string | null; tal: number | null },
): ProgramMetricCell {
  const tal = talOf(skola);
  const diff = tal != null && riks.tal != null ? tal - riks.tal : null;
  const [min, max] = metrik.domain;
  const span = (max - min) * DEVIATION_SPAN;
  return {
    metrik,
    text: skola?.status === "finns" ? skola.text : DASH,
    tal,
    riksText: riks.text,
    riksTal: riks.tal,
    diff,
    t: diff != null && span > 0 ? clamp(diff / span, -1, 1) : null,
  };
}

/** Reads one metric off a programme — elevantal sits beside the rest, not in them. */
function värde(p: SkolaProgram, key: ProgramNyckeltalKey): NyckeltalVärde | undefined {
  return key === "antalElever" ? p.antalElever : p.nyckeltal[key];
}

export function buildProgramComparisons(
  program: SkolaProgram[],
  riksByKod: Map<string, NationelltProgramGenomsnitt>,
  beräknatProgram: Map<string, Partial<Record<ProgramNyckeltalKey, number>>>,
): ProgramComparison[] {
  const rows = program.map((p) => {
    const cells = programmetriker.map((metrik) =>
      cell(
        metrik,
        värde(p, metrik.key),
        riksOf(
          riksByKod.get(p.kod)?.nyckeltal[metrik.key],
          beräknatProgram.get(p.kod)?.[metrik.key],
          metrik,
        ),
      ),
    );
    const directed = cells.filter((c) => c.metrik.higherIsBetter === true && c.t != null);
    return {
      kod: p.kod,
      namn: p.namn,
      elever: talOf(p.antalElever) != null ? num(talOf(p.antalElever)) : DASH,
      cells,
      score: directed.length
        ? directed.reduce((sum, c) => sum + (c.t ?? 0), 0) / directed.length
        : null,
    };
  });

  return sortProgramComparisons(rows, null);
}

/**
 * `null` sorts by how the programme stands against riket, strongest first —
 * the order the table opens in. Otherwise by one metric's own figure.
 *
 * A programme with nothing to compare goes last either way: a missing figure
 * is not a low one, and the same rule governs the lists elsewhere in the app.
 */
export function sortProgramComparisons(
  rows: ProgramComparison[],
  sort: ProgramSort,
): ProgramComparison[] {
  const byName = (a: ProgramComparison, b: ProgramComparison) =>
    a.namn.localeCompare(b.namn, "sv");

  if (!sort) {
    return [...rows].sort((a, b) => {
      if (a.score == null && b.score == null) return byName(a, b);
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score || byName(a, b);
    });
  }

  const index = programmetriker.findIndex((m) => m.key === sort.key);
  const valueOf = (r: ProgramComparison) =>
    index < 0 ? null : (r.cells[index]?.tal ?? null);

  return [...rows].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av == null && bv == null) return byName(a, b);
    if (av == null) return 1;
    if (bv == null) return -1;
    return (sort.dir === "desc" ? bv - av : av - bv) || byName(a, b);
  });
}

/**
 * Clicking a header cycles descending → ascending → back to the default
 * order. Highest-first comes first because that is the question a reader
 * usually has of a column of figures.
 */
export function nextProgramSort(
  current: ProgramSort,
  key: ProgramNyckeltalKey,
): ProgramSort {
  if (current?.key !== key) return { key, dir: "desc" };
  if (current.dir === "desc") return { key, dir: "asc" };
  return null;
}

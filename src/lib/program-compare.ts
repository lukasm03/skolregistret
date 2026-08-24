import {
  DEVIATION_SPAN,
  programmetriker,
  type ProgramMetrik,
} from "@/config/programmetriker";
import { direction, type Direction } from "./compare";
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
  /** Which side of riket the figure falls on, or `none` for an undirected measure. */
  riktning: Direction;
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
  /**
   * One sentence on how the row stands. Nothing renders it since the rows
   * stopped expanding, and it is kept for the same reason `EnkätJämförelse`
   * keeps its own: the sentence is the model's answer to "how does this one
   * stand", and the figures still need it if a per-row reading comes back.
   */
  sammanfattning: string;
}

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
    riktning: direction(diff, metrik.higherIsBetter),
  };
}

/**
 * How the programme stands against the same programme nationally — counted
 * over the measures that have a direction *and* figures on both sides, which
 * is the only set the colours on the row mean anything for.
 */
function sammanfattning(cells: ProgramMetricCell[]): string {
  const jämförbara = cells.filter((c) => c.riktning !== "none");
  if (jämförbara.length === 0) {
    return (
      "Programmet har inga jämförbara resultatmått — Skolverket redovisar " +
      "inga rikstal för det här programmet."
    );
  }
  const bättre = jämförbara.filter((c) => c.riktning === "over").length;
  const sämre = jämförbara.filter((c) => c.riktning === "under").length;
  return (
    `${bättre} av ${jämförbara.length} jämförbara mått ligger över ` +
    `riksgenomsnittet${sämre ? ` och ${sämre} under` : ""}. ` +
    "Jämförelsen görs mot samma program i hela landet, inte mot skolans övriga program."
  );
}

/** Reads one metric off a programme — elevantal sits beside the rest, not in them. */
function värde(p: SkolaProgram, key: ProgramNyckeltalKey): NyckeltalVärde | undefined {
  return key === "antalElever" ? p.antalElever : p.nyckeltal[key];
}

/**
 * Some gymnasieskolor report no unit-wide elevantal but do report one per
 * programme — summing those gives an approximate total instead of a dash.
 * `null` when no programme has a figure to sum.
 */
export function sumProgramElever(program: SkolaProgram[]): number | null {
  const tal = program
    .map((p) => talOf(p.antalElever))
    .filter((v): v is number => v != null);
  return tal.length ? tal.reduce((sum, v) => sum + v, 0) : null;
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
      sammanfattning: sammanfattning(cells),
    };
  });

  return sortProgramComparisons(rows);
}

/**
 * The order the table opens in — and the only one it has: by how the
 * programme stands against riket, strongest first.
 *
 * The table used to let a header sort it by one metric. That went with the
 * expandable rows and the grouped headers when the tab became an ordinary
 * `DataTable` like the nyckeltal and enkät tabs beside it, none of which
 * sort either.
 *
 * A programme with nothing to compare goes last rather than first: a missing
 * figure is not a low one, and the same rule governs the lists elsewhere in
 * the app.
 */
export function sortProgramComparisons(rows: ProgramComparison[]): ProgramComparison[] {
  const byName = (a: ProgramComparison, b: ProgramComparison) =>
    a.namn.localeCompare(b.namn, "sv");

  return [...rows].sort((a, b) => {
    if (a.score == null && b.score == null) return byName(a, b);
    if (a.score == null) return 1;
    if (b.score == null) return -1;
    return b.score - a.score || byName(a, b);
  });
}

/**
 * The gymnasieprogram table on the skolenhet detail page. Each program gets its
 * own row followed by an optional muted riksgenomsnitt row, built by
 * `programRow` and `programGenomsnittRow` respectively.
 */

import type { Column } from "@/components/ui/DataTable";
import { DASH, dec, num } from "@/lib/format";
import type {
  NationelltProgramGenomsnitt,
  NyckeltalVärde,
  ProgramNyckeltalKey,
  SkolaProgram,
} from "@/lib/skolregister";

/** `metric`'s counterpart for a live-API `NyckeltalVärde` — always the register's own string. */
function programValue(v: NyckeltalVärde): string {
  return v.status === "finns" ? v.text : DASH;
}

/**
 * Elevantalet, as a plain number rather than Skolverket's rounded "cirka 330"
 * — the register's own text is kept in `programValue` for the other columns,
 * but a headcount reads better bare in a table this dense.
 */
function programElevCount(v: NyckeltalVärde): string {
  return v.status === "finns" && v.tal != null ? num(v.tal) : DASH;
}

/**
 * Some gymnasieskolor report no unit-wide elevantal but do report one per
 * program — summing those gives an approximate total instead of a dash.
 * `null` when no program has a figure to sum.
 */
export function sumProgramElever(program: SkolaProgram[]): number | null {
  const values = program
    .map((p) => p.antalElever)
    .filter(
      (v): v is Extract<NyckeltalVärde, { status: "finns" }> => v.status === "finns",
    )
    .map((v) => v.tal);
  return values.length ? values.reduce((sum, v) => sum + v, 0) : null;
}

/**
 * The national average text for a program metric: Skolverket's own rounded
 * string when its endpoint has it, otherwise our own computed average across
 * every unit running the program — formatted to one decimal since it isn't
 * the register's own rounded text.
 */
function programRiksText(
  officiell: NyckeltalVärde | undefined,
  beräknat: number | undefined,
): string | null {
  if (officiell?.status === "finns") return officiell.text;
  return beräknat != null ? dec(beräknat) : null;
}

export interface ProgramRow {
  key: string;
  namn: string;
  antalElever: string;
  lägstaAntagningspoäng: string;
  genomsnittligAntagningspoäng: string;
  andelMedExamenInom3År: string;
  betygspoängMedExamen: string;
  andelMedHögskolebehörighet: string;
  /** Riks-genomsnitt row for the program above it, styled as a quieter comparison line. */
  muted?: boolean;
}

export function programRow(p: SkolaProgram): ProgramRow {
  return {
    key: p.kod,
    namn: p.namn,
    antalElever: programElevCount(p.antalElever),
    lägstaAntagningspoäng: programValue(p.nyckeltal.lägstaAntagningspoäng),
    genomsnittligAntagningspoäng: programValue(p.nyckeltal.genomsnittligAntagningspoäng),
    andelMedExamenInom3År: programValue(p.nyckeltal.andelMedExamenInom3År),
    betygspoängMedExamen: programValue(p.nyckeltal.betygspoängMedExamen),
    andelMedHögskolebehörighet: programValue(p.nyckeltal.andelMedHögskolebehörighet),
  };
}

/** `null` when the program has no national average for any column, so the caller can drop the row entirely. */
export function programGenomsnittRow(
  p: SkolaProgram,
  riksByKod: Map<string, NationelltProgramGenomsnitt>,
  beräknatProgram: Map<string, Partial<Record<ProgramNyckeltalKey, number>>>,
): ProgramRow | null {
  const riksText = (key: ProgramNyckeltalKey) =>
    programRiksText(
      riksByKod.get(p.kod)?.nyckeltal[key],
      beräknatProgram.get(p.kod)?.[key],
    );
  const antalElever = riksText("antalElever");
  const lägstaAntagningspoäng = riksText("lägstaAntagningspoäng");
  const genomsnittligAntagningspoäng = riksText("genomsnittligAntagningspoäng");
  const andelMedExamenInom3År = riksText("andelMedExamenInom3År");
  const betygspoängMedExamen = riksText("betygspoängMedExamen");
  const andelMedHögskolebehörighet = riksText("andelMedHögskolebehörighet");
  if (
    [
      antalElever,
      lägstaAntagningspoäng,
      genomsnittligAntagningspoäng,
      andelMedExamenInom3År,
      betygspoängMedExamen,
      andelMedHögskolebehörighet,
    ].every((v) => v == null)
  )
    return null;
  return {
    key: `${p.kod}-riks`,
    namn: "Riksgenomsnitt",
    antalElever: antalElever ?? DASH,
    lägstaAntagningspoäng: lägstaAntagningspoäng ?? DASH,
    genomsnittligAntagningspoäng: genomsnittligAntagningspoäng ?? DASH,
    andelMedExamenInom3År: andelMedExamenInom3År ?? DASH,
    betygspoängMedExamen: betygspoängMedExamen ?? DASH,
    andelMedHögskolebehörighet: andelMedHögskolebehörighet ?? DASH,
    muted: true,
  };
}

function programCell(value: string, muted: boolean | undefined) {
  return muted ? <span className="text-ink-muted">{value}</span> : value;
}

export const programColumns: Column<ProgramRow>[] = [
  {
    key: "namn",
    header: "Program",
    cell: (r) => (
      <span className={r.muted ? "pl-4 text-sm text-ink-muted" : undefined}>
        {r.namn}
      </span>
    ),
    truncate: true,
  },
  {
    key: "antalElever",
    header: "Elever",
    width: 76,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.antalElever, r.muted),
  },
  {
    key: "lägstaAntagningspoäng",
    header: "Lägsta poäng",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.lägstaAntagningspoäng, r.muted),
  },
  {
    key: "genomsnittligAntagningspoäng",
    header: "Medelpoäng",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.genomsnittligAntagningspoäng, r.muted),
  },
  {
    key: "andelMedExamenInom3År",
    header: "Examen 3 år",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.andelMedExamenInom3År, r.muted),
  },
  {
    key: "betygspoängMedExamen",
    header: "Betygspoäng",
    width: 108,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.betygspoängMedExamen, r.muted),
  },
  {
    key: "andelMedHögskolebehörighet",
    header: "Högsk.behörighet",
    width: 128,
    align: "right",
    mono: true,
    cell: (r) => programCell(r.andelMedHögskolebehörighet, r.muted),
  },
];

export type HuvudmanTyp = "Kommunal" | "Fristående";

/**
 * Driftstatus as the register reports it. "Okänd" is ours: it catches a status
 * string we have no mapping for, so an unknown value shows up in the filter
 * instead of being silently counted as running.
 */
export type SkolStatus =
  | "Aktiv"
  | "Vilande"
  | "Planerad"
  | "Upphörd"
  | "Avvecklad"
  | "Okänd";

/** The order the status filter lists them in — running first, gone last. */
export const SKOLSTATUS_ORDER: SkolStatus[] = [
  "Aktiv",
  "Planerad",
  "Vilande",
  "Upphörd",
  "Avvecklad",
  "Okänd",
];

/** The statuses shown when nothing is selected: only units actually running. */
export const DEFAULT_STATUS: SkolStatus[] = ["Aktiv"];

export function isSkolStatus(v: string): v is SkolStatus {
  return (SKOLSTATUS_ORDER as string[]).includes(v);
}

/**
 * Skolform codes as the register spells them in `schoolTypes`. Units can carry
 * codes outside this list; those are kept on `ListSchool.otherForms` and shown,
 * but they get no statistics view because we have no metric definitions.
 */
const SKOLFORM_CODES = [
  "FKLASS",
  "GR",
  "GRS",
  "SP",
  "SAM",
  "FTH",
  "GY",
  "GYS",
  "VUX",
] as const;

export type SkolformCode = (typeof SKOLFORM_CODES)[number];

export function isSkolformCode(v: string): v is SkolformCode {
  return (SKOLFORM_CODES as readonly string[]).includes(v);
}

/** Why a figure is absent. The register says this explicitly — don't infer it. */
type MissingReason =
  /** "." — not collected for this unit and period. */
  | "MISSING"
  /** ".." — withheld because too few pupils. */
  | "FEW_PUPILS"
  /** Any other valueType the register may add. */
  | "NOT_REPORTED";

/**
 * One figure from the register. `raw` is the API's own Swedish string and is
 * what gets rendered; `value` exists so we can sort, compare and take medians.
 * A withheld figure keeps its reason so the UI can explain the gap.
 */
export interface MetricValue {
  raw: string;
  value: number | null;
  missing: MissingReason | null;
}

/** Everything the register reports about one skolform at one unit. */
export interface SchoolFormStats {
  /** Årskurser offered, e.g. "F–9". Empty for forms without årskurser. */
  gradeSpan: string;
  students: MetricValue | null;
  /** Keyed by the API's own field name inside `statistics[form]`. */
  metrics: Record<string, MetricValue>;
}

export interface Huvudman {
  /** URL segment. */
  slug: string;
  name: string;
  typ: HuvudmanTyp;
  org: string | null;
  /** Name of the koncernmoder, null for standalone or kommunal. */
  koncern: string | null;
  /**
   * Riket-wide totals. Only present when a source that actually covers riket
   * has been merged in — the school register call is scoped to one kommun and
   * cannot answer this.
   */
  riket?: { enheter: number; elever: number };
  registered?: string;
  employees?: string;
  owner?: string;
  /** Overrides the generated fact list in the detail rail. */
  facts?: [string, string][];
}

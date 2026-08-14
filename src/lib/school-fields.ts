import type {
  HuvudmanTyp,
  MetricValue,
  SchoolFormStats,
  SkolformCode,
  SkolStatus,
} from "./types";

/**
 * All reading of a school row goes through these accessors, because every
 * figure is qualified by skolform: "elever" at a unit that runs both
 * grundskola and gymnasium is two different numbers, and comparing across
 * forms is meaningless. Pass the selected form; pass nothing for the
 * unit-wide view.
 *
 * This module is deliberately free of any data-source import: the list views
 * run the same filtering and sorting in the browser, and pulling the register
 * client in would drag the whole register into the client bundle.
 */

/** One skolenhet as the list and detail views read it. */
export interface ListSchool {
  /** Skolenhetskod — the stable id, used in URLs. */
  kod: string;
  name: string;
  /** Display name of the huvudman. */
  huvudman: string;
  typ: HuvudmanTyp;
  status: SkolStatus;
  kommunkod: string | null;
  /** Kommunnamn resolved from `kommunkod` — the register only sends the code. */
  kommun: string | null;
  /** Known skolformer at this unit, in registry order. */
  forms: SkolformCode[];
  /** Register codes we have no definition for; shown, never compared. */
  otherForms: string[];
  stats: Partial<Record<SkolformCode, SchoolFormStats>>;
  /** Sum over the forms that count their own pupils; null when none report. */
  students: number | null;
  /**
   * Every årskurs the unit covers, across all forms — the union the register
   * reports. `"0"` is förskoleklass. Empty means Skolverket reports no years
   * for this unit, not that it teaches none.
   */
  years: string[];
  /** `years` as a display span, e.g. "F–9". Empty when `years` is. */
  gradeSpan: string;
  /** Programme names offered, deduped — what the programme filter reads. */
  programmes: string[];
}

export function studentsOf(school: ListSchool, form?: SkolformCode): number | null {
  if (!form) return school.students;
  return school.stats[form]?.students?.value ?? null;
}

/**
 * Årskurser the unit covers, narrowed to one skolform when given. Empty means
 * the register reports no years — for the unit-wide view that is a
 * gymnasieskola or similar, and for a form it may simply be a form the unit
 * does not run.
 */
export function yearsOf(school: ListSchool, form?: SkolformCode): string[] {
  return (form ? school.stats[form]?.years : school.years) ?? [];
}

function metricValue(
  school: ListSchool,
  form: SkolformCode | undefined,
  key: string,
): MetricValue | null {
  if (!form) return null;
  return school.stats[form]?.metrics[key] ?? null;
}

export function metricNumberOf(
  school: ListSchool,
  form: SkolformCode | undefined,
  key: string,
): number | null {
  return metricValue(school, form, key)?.value ?? null;
}

const byName = (a: ListSchool, b: ListSchool) => a.name.localeCompare(b.name, "sv");

/**
 * What a list column sorts on, by column key. This is the single definition:
 * the table columns hand it to TanStack Table in the browser, and
 * `sortSchools` uses it for the server-rendered first page, so both orders
 * agree. `undefined` means "not reported" — never a low value.
 */
export function schoolSortValue(
  school: ListSchool,
  key: string,
  form?: SkolformCode,
): string | number | undefined {
  switch (key) {
    case "name":
      return school.name;
    case "huvudman":
      return school.huvudman;
    case "kommun":
      return school.kommun ?? undefined;
    case "status":
      return school.status;
    case "elever":
      return studentsOf(school, form) ?? undefined;
    default:
      return metricNumberOf(school, form, key) ?? undefined;
  }
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "sv");
}

export function sortSchools<T extends ListSchool>(
  rows: T[],
  sort: string,
  form?: SkolformCode,
  desc = false,
): T[] {
  return [...rows].sort((a, b) => {
    const av = schoolSortValue(a, sort, form);
    const bv = schoolSortValue(b, sort, form);
    // Units with no value sort last either way — a blank is not a low score.
    if (av === undefined || bv === undefined) {
      if (av === bv) return byName(a, b);
      return av === undefined ? 1 : -1;
    }
    const cmp = compareValues(av, bv);
    if (cmp === 0) return byName(a, b);
    return desc ? -cmp : cmp;
  });
}

/**
 * The missing-value-aware comparator behind every list sort.
 *
 * The domain rule it carries: **a blank sorts last, never first**, in both
 * directions — a missing figure means "not reported", not a low score. It
 * was previously written out once per list module (`school-fields.ts`,
 * `huvudman-select.ts`, `koncern-select.ts`) plus a variant inside
 * `DataGrid`; this is the one definition they all share, so a collation or
 * tiebreak fix lands once.
 *
 * Pure and free of any data-source import, like `school-fields.ts`: the list
 * views run their sorting in the browser off this module too.
 */

/** What a sortable column reads off a row; `undefined` is "not reported". */
export type SortValue = string | number | undefined;

/**
 * Numbers compare numerically, everything else with Swedish collation.
 * Callers settle absent values before reaching this — see `sortRows`.
 */
export function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "sv");
}

/**
 * Sort rows by one value accessor. Rows whose value is `undefined` go last
 * whichever way the column points, ties break through `tiebreak` (normally
 * name), and `desc` flips everything else.
 */
export function sortRows<T>(
  rows: T[],
  valueOf: (row: T) => SortValue,
  desc = false,
  tiebreak?: (a: T, b: T) => number,
): T[] {
  const byTiebreak = tiebreak ?? (() => 0);
  return [...rows].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av === undefined || bv === undefined) {
      if (av === bv) return byTiebreak(a, b);
      return av === undefined ? 1 : -1;
    }
    const cmp = compareValues(av, bv);
    if (cmp === 0) return byTiebreak(a, b);
    return desc ? -cmp : cmp;
  });
}

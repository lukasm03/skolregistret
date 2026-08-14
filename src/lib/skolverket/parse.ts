/**
 * Årskurs handling.
 *
 * Two representations meet here. The register reports a unit's years as an
 * array of strings where `"0"` is förskoleklass (`["0", "1", "2", "3"]`). The
 * filter chips, on the other hand, are human-readable spans (`"F"`, `"1–3"`),
 * because a chip per year would be nine chips. `expandSpan` turns a chip into
 * years so the two can be compared, and `formatYears` turns years back into a
 * span for display.
 */

/** Förskoleklass is year "0" in the register's own lists. */
export const FÖRSKOLEKLASS = "0";

/** How förskoleklass is written in a span, since "0" would read as a year zero. */
const FÖRSKOLEKLASS_LABEL = "F";

/**
 * One grade token as a sortable level; förskoleklass is 0, årskurs n is n,
 * and anything unreadable is NaN so the caller can skip it.
 *
 * The empty check is load-bearing: `Number("")` is 0, which is also
 * förskoleklass, so without it an empty or whitespace-only token would parse
 * as F and match the "F" chip.
 */
const level = (token: string): number => {
  const s = token.trim();
  if (!s) return NaN;
  return s.toUpperCase() === FÖRSKOLEKLASS_LABEL ? 0 : Number(s);
};

const yearLabel = (n: number): string => (n === 0 ? FÖRSKOLEKLASS_LABEL : String(n));

/**
 * Expand a span into the years it covers, as the register writes them:
 * `"1–3"` → `["1", "2", "3"]`, `"F"` → `["0"]`, `"F, 4–6"` → `["0","4","5","6"]`.
 * Unreadable parts are skipped rather than throwing, so a malformed chip
 * simply matches nothing.
 */
export function expandSpan(span: string): string[] {
  const out: string[] = [];
  for (const part of span.split(",")) {
    const [from, to] = part.split(/[–-]/).map(level);
    if (!Number.isFinite(from)) continue;
    const end = Number.isFinite(to) ? to : from;
    for (let i = from; i <= end; i++) out.push(String(i));
  }
  return out;
}

/**
 * True when the two year lists share at least one årskurs — the overlap test
 * the årskurs filter runs.
 *
 * A unit with no reported years therefore matches nothing. That is the honest
 * answer to "does this unit teach year 5", but it does mean a year filter
 * silently excludes every gymnasieskola, specialskola and sameskola, since
 * Skolverket reports years only for förskoleklass, grundskola and anpassad
 * grundskola. The filter chips are scoped per skolform to keep that out of
 * reach from the UI — see `gradeFilter` in `src/config/skolformer.ts`.
 *
 * Both sides go through `level` rather than being compared as strings, so
 * that matching agrees with display: `formatYears` already parses tokens
 * numerically, and a register that wrote `"01"` or `"F"` where it usually
 * writes `"1"` or `"0"` would otherwise render fine on the detail page while
 * silently matching no chip in the list.
 */
export function yearsOverlap(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const wanted = new Set(b.map(level).filter((n) => Number.isFinite(n)));
  return a.map(level).some((n) => Number.isFinite(n) && wanted.has(n));
}

/**
 * Years as a display span: `["0"…"9"]` → `"F–9"`, and a unit that skips years
 * in between keeps them visible as separate runs (`["0","4","5","6"]` →
 * `"F, 4–6"`) rather than being flattened into a misleading `"F–6"`.
 *
 * Empty years give an empty string: the register reports no years for this
 * unit, which is not the same as it having none.
 *
 * Nullish is accepted for the same reason: `SkolaDetalj` reaches the detail
 * page as an unvalidated cast over JSON, from the live API or from an export
 * file old enough to predate the field, so a caller cannot promise an array.
 */
export function formatYears(years: string[] | null | undefined): string {
  const nums = [...new Set((years ?? []).map(level))]
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!nums.length) return "";

  const runs: [number, number][] = [];
  for (const n of nums) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }

  return runs
    .map(([from, to]) =>
      from === to ? yearLabel(from) : `${yearLabel(from)}–${yearLabel(to)}`,
    )
    .join(", ");
}

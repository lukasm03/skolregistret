import { DEFAULT_STATUS, HUVUDMANTYP_ORDER, SKOLSTATUS_ORDER } from "./types";
import type { HuvudmanQuery, SchoolQuery } from "./query";

/**
 * What the list is currently narrowed by, as removable tokens.
 *
 * The sidebar holds the controls but says nothing on the results side, so a
 * filter that empties the list — a stale årskurs from a shared link, an
 * elevintervall typed three groups down — has to be hunted for. These are the
 * same filters read back out, next to the count they produced.
 *
 * Pure and display-free: the labels a token needs but a query does not carry
 * (a kommun's name, a huvudman's name) come in as `labels`.
 */

/** The patch shape the views apply; `null` removes a param. */
export type ClearPatch = Record<string, string | number | null>;

export interface ActiveFilter {
  /** Stable across renders — also the React key. */
  key: string;
  /** What the filter is, e.g. "Kommun". */
  label: string;
  /** What it is set to, e.g. "Uppsala". */
  value: string;
  /** Applied to remove this one filter. */
  clear: ClearPatch;
}

export interface FilterLabels {
  /** Display name for `query.kommun`. */
  kommun?: string;
  /** Display name for `query.huvudman`. */
  huvudman?: string;
  /** Display label for `query.skolform`. */
  skolform?: string;
}

/** Sort follows the skolform, so dropping the form has to drop the sort too. */
const CLEAR_FORM: ClearPatch = {
  skolform: null,
  arskurs: null,
  program: null,
  sort: null,
  dir: null,
};

function statusFilter(status: string[]): ActiveFilter | null {
  const isDefault =
    status.length === DEFAULT_STATUS.length &&
    DEFAULT_STATUS.every((s) => status.includes(s));
  if (isDefault) return null;
  return {
    key: "status",
    label: "Status",
    // An explicitly empty status matches nothing, and saying so is the point:
    // it is the one filter that can empty the list while looking unset.
    value: status.length === 0 ? "ingen vald" : orderedStatus(status).join(", "),
    clear: { status: null },
  };
}

function orderedStatus(status: string[]): string[] {
  return SKOLSTATUS_ORDER.filter((s) => status.includes(s));
}

/**
 * `label` differs per page on purpose, and a token has to read back the
 * heading that produced it: the skolenhet list says "Huvudmannatyp" to
 * separate it from skolform, while a page already about huvudmän needs only
 * "Typ".
 */
function typFilter(typ: string[], label: string): ActiveFilter | null {
  // Every type selected is the default; none is the empty-list case above.
  if (typ.length === HUVUDMANTYP_ORDER.length) return null;
  return {
    key: "typ",
    label,
    value: typ.length === 0 ? "ingen vald" : typ.join(", "),
    clear: { typ: null },
  };
}

function rangeFilter(min?: number, max?: number): ActiveFilter | null {
  if (min == null && max == null) return null;
  const value =
    min != null && max != null
      ? `${min}–${max}`
      : min != null
        ? `från ${min}`
        : `upp till ${max}`;
  return {
    key: "elever",
    label: "Elever",
    value,
    clear: { min: null, max: null },
  };
}

function searchFilter(q: string): ActiveFilter | null {
  // The term arrives as typed, so a half-finished "vasa " is a filter but
  // whitespace on its own is not, and neither is worth a token with a
  // trailing space in it.
  const term = q.trim();
  if (!term) return null;
  return { key: "q", label: "Sök", value: term, clear: { q: null } };
}

export function activeSchoolFilters(
  query: SchoolQuery,
  labels: FilterLabels = {},
): ActiveFilter[] {
  const filters: (ActiveFilter | null)[] = [
    searchFilter(query.q),
    query.kommun
      ? {
          key: "kommun",
          label: "Kommun",
          value: labels.kommun ?? query.kommun,
          clear: { kommun: null },
        }
      : null,
    query.huvudman
      ? {
          key: "huvudman",
          label: "Huvudman",
          value: labels.huvudman ?? query.huvudman,
          clear: { huvudman: null },
        }
      : null,
    query.skolform
      ? {
          key: "skolform",
          label: "Skolform",
          value: labels.skolform ?? query.skolform,
          clear: CLEAR_FORM,
        }
      : null,
    typFilter(query.typ, "Huvudmannatyp"),
    query.arskurs.length
      ? {
          key: "arskurs",
          label: "Årskurs",
          value: query.arskurs.join(", "),
          clear: { arskurs: null },
        }
      : null,
    query.program.length
      ? {
          key: "program",
          label: "Program",
          value:
            query.program.length === 1
              ? query.program[0]
              : `${query.program.length} valda`,
          clear: { program: null },
        }
      : null,
    statusFilter(query.status),
    rangeFilter(query.minElever, query.maxElever),
  ];
  return filters.filter((f): f is ActiveFilter => f != null);
}

export function activeHuvudmanFilters(
  query: HuvudmanQuery,
  labels: FilterLabels = {},
): ActiveFilter[] {
  const filters: (ActiveFilter | null)[] = [
    searchFilter(query.q),
    query.kommun
      ? {
          key: "kommun",
          label: "Verksam i kommun",
          value: labels.kommun ?? query.kommun,
          clear: { kommun: null },
        }
      : null,
    query.skolform
      ? {
          key: "skolform",
          label: "Skolform",
          value: labels.skolform ?? query.skolform,
          clear: CLEAR_FORM,
        }
      : null,
    typFilter(query.typ, "Typ"),
    query.koncernOnly
      ? {
          key: "koncern",
          label: "Koncern",
          value: "endast koncernbolag",
          clear: { koncern: null },
        }
      : null,
  ];
  return filters.filter((f): f is ActiveFilter => f != null);
}

/**
 * One patch that removes every filter in `filters` at once. Built from the
 * tokens themselves, so a filter that is added to the lists above is cleared
 * by "Rensa filter" without being listed a second time here.
 */
export function clearAllPatch(filters: ActiveFilter[]): ClearPatch {
  return Object.assign({}, ...filters.map((f) => f.clear), { page: null });
}

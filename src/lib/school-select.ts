import { kommunName } from "@/data/kommuner";
import type { SchoolQuery } from "./query";
import { sortSchools, studentsOf, yearsOf, type ListSchool } from "./school-fields";
import { matches, needle as foldNeedle } from "./search";
import { expandSpan, yearsOverlap } from "./skolverket/parse";
import {
  HUVUDMANTYP_ORDER,
  SKOLSTATUS_ORDER,
  type HuvudmanTyp,
  type SkolStatus,
  type SkolformCode,
} from "./types";

/** One entry in the kommun dropdown. */
export interface KommunOption {
  kod: string;
  name: string;
  /** Units this kommun would give you under the rest of the filter. */
  count: number;
}

/** One entry in the gymnasieskola programme chips. */
export interface ProgramOption {
  name: string;
  /** Units this programme would give you under the rest of the filter. */
  count: number;
}

interface SchoolSelection<T extends ListSchool> {
  /** Everything that matches the filter, in the requested order. */
  sorted: T[];
  counts: Record<HuvudmanTyp, number>;
  formCounts: Map<SkolformCode, number>;
  /** Units per status under the rest of the filter, in display order. */
  statusCounts: { status: SkolStatus; count: number }[];
  kommuner: KommunOption[];
  /** Only populated with skolform=GY selected — programmes don't apply elsewhere. */
  gymnasieprogram: ProgramOption[];
}

/**
 * Filter, count and sort in one pass. Pure and free of I/O, so the server
 * renders the first page with it and the browser re-runs it on every filter
 * change without a round trip.
 *
 * `huvudmanName` is the resolved display name of `query.huvudman` — the
 * mapping from slug to name needs the huvudman list, which this doesn't have.
 */
export function selectSchools<T extends ListSchool>(
  all: T[],
  query: SchoolQuery,
  huvudmanName?: string,
): SchoolSelection<T> {
  const form = query.skolform;

  // The chips are spans ("1–3"); the register reports individual years. Expand
  // once here rather than per row.
  const valdaÅrskurser = query.arskurs.flatMap(expandSpan);

  // Folded once rather than per row: this runs over the whole register on
  // every keystroke, and a term of only spaces is not a filter. Folding is
  // what lets "malardalen" find Mälardalens — see `lib/search.ts`.
  const needle = foldNeedle(query.q);

  const tests = {
    status: (s: T) => query.status.includes(s.status),
    huvudman: (s: T) => !huvudmanName || s.huvudman === huvudmanName,
    kommun: (s: T) => !query.kommun || s.kommunkod === query.kommun,
    q: (s: T) => !needle || matches(s.name, needle),
    skolform: (s: T) => !form || s.forms.includes(form),
    // Overlap, not containment: picking "4–6" keeps a unit running F–9. A unit
    // the register reports no years for matches nothing — see `yearsOverlap`.
    arskurs: (s: T) =>
      !valdaÅrskurser.length || yearsOverlap(yearsOf(s, form), valdaÅrskurser),
    elever: (s: T) => {
      if (query.minElever == null && query.maxElever == null) return true;
      const n = studentsOf(s, form);
      if (n == null) return false;
      if (query.minElever != null && n < query.minElever) return false;
      if (query.maxElever != null && n > query.maxElever) return false;
      return true;
    },
    typ: (s: T) => query.typ.includes(s.typ),
    program: (s: T) =>
      !query.program.length || query.program.some((p) => s.programmes.includes(p)),
  };

  /** Apply every test but one, so that filter's own counts stay meaningful.
   *  The entries are hoisted out of the callback: this filter runs once per
   *  row per pass over the whole register, and rebuilding the entries inside
   *  it allocated tens of thousands of throwaway arrays per selection. */
  const testEntries = Object.entries(tests);
  const applyExcept = (except?: keyof typeof tests) =>
    all.filter((s) => testEntries.every(([k, test]) => k === except || test(s)));

  // Counts next to the type checkboxes reflect what is still available, so
  // they don't collapse to zero as soon as you narrow the type.
  const forTyp = applyExcept("typ");
  const counts = Object.fromEntries(
    HUVUDMANTYP_ORDER.map((t) => [t, forTyp.filter((s) => s.typ === t).length]),
  ) as Record<HuvudmanTyp, number>;

  // Same idea for the skolform chips: how many units each form would give you
  // from here, not from the current form's selection.
  const forForm = applyExcept("skolform");
  const formCounts = new Map<SkolformCode, number>();
  for (const s of forForm) {
    for (const f of s.forms) formCounts.set(f, (formCounts.get(f) ?? 0) + 1);
  }

  // Only statuses that actually occur get a checkbox — the register does not
  // use every one of them in every extract.
  const forStatus = applyExcept("status");
  const perStatus = new Map<SkolStatus, number>();
  for (const s of forStatus) {
    perStatus.set(s.status, (perStatus.get(s.status) ?? 0) + 1);
  }
  const statusCounts = SKOLSTATUS_ORDER.filter(
    (s) => perStatus.has(s) || query.status.includes(s),
  ).map((status) => ({ status, count: perStatus.get(status) ?? 0 }));

  // The kommun dropdown lists every kommun that has units under the *other*
  // filters, so picking one never lands you on an empty list.
  const forKommun = applyExcept("kommun");
  const kommunCounts = new Map<string, number>();
  for (const s of forKommun) {
    if (!s.kommunkod) continue;
    kommunCounts.set(s.kommunkod, (kommunCounts.get(s.kommunkod) ?? 0) + 1);
  }
  // A kommun selected but filtered out by something else still needs an entry,
  // or the select would render with no matching option.
  if (query.kommun && !kommunCounts.has(query.kommun)) {
    kommunCounts.set(query.kommun, 0);
  }
  const kommuner: KommunOption[] = [...kommunCounts.entries()]
    .map(([kod, count]) => ({ kod, name: kommunName(kod) ?? kod, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));

  // Programme chips: only meaningful with gymnasieskola selected, same idea
  // as the kommun dropdown otherwise — counts reflect the rest of the filter.
  const forProgram = form === "GY" ? applyExcept("program") : [];
  const programCounts = new Map<string, number>();
  for (const s of forProgram) {
    for (const p of s.programmes) {
      programCounts.set(p, (programCounts.get(p) ?? 0) + 1);
    }
  }
  for (const p of query.program) {
    if (!programCounts.has(p)) programCounts.set(p, 0);
  }
  const programmes: ProgramOption[] = [...programCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));

  return {
    sorted: sortSchools(applyExcept(), query.sort, form, query.desc),
    counts,
    formCounts,
    statusCounts,
    kommuner,
    gymnasieprogram: programmes,
  };
}

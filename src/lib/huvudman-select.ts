import { kommunName } from "@/data/kommuner";
import type { HuvudmanQuery } from "./query";
import { studentsOf, type ListSchool } from "./school-fields";
import { matches, needle as foldNeedle } from "./search";
import { sortRows } from "./sort-rows";
import type { KommunOption } from "./school-select";
import {
  HUVUDMANTYP_ORDER,
  type Huvudman,
  type HuvudmanTyp,
  type SkolformCode,
} from "./types";

/**
 * Aggregating huvudmän out of the unit list, pure and free of I/O — the same
 * code runs on the server for the first paint and in the browser for every
 * filter change after it.
 */

export type HuvudmanAggregate = {
  huvudman: Huvudman;
  /** Units in scope belonging to the huvudman (running only). */
  units: ListSchool[];
  enheter: number;
  elever: number;
};

/** Elevtal summed over the units that are running. */
function sumStudents(units: ListSchool[], form?: SkolformCode): number {
  return units.reduce((sum, s) => sum + (studentsOf(s, form) ?? 0), 0);
}

/** Every kommun with units, for the dropdown.
 *
 *  Memoized on the array itself: it reads nothing but the unit list, so it is
 *  the same answer for the same array — yet `selectHuvudman` runs per
 *  keystroke, and without the memo each one re-scanned and re-sorted all
 *  ~6 500 units just to rebuild a dropdown that never depends on the query.
 *  A `WeakMap` needs no invalidation — a new array is a new answer. */
const kommunOptionsPerList = new WeakMap<ListSchool[], KommunOption[]>();

function listKommunOptions(all: ListSchool[]): KommunOption[] {
  const memo = kommunOptionsPerList.get(all);
  if (memo) return memo;

  const counts = new Map<string, number>();
  for (const s of all) {
    if (!s.kommunkod) continue;
    counts.set(s.kommunkod, (counts.get(s.kommunkod) ?? 0) + 1);
  }
  const options = [...counts.entries()]
    .map(([kod, count]) => ({ kod, name: kommunName(kod) ?? kod, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  kommunOptionsPerList.set(all, options);
  return options;
}

function aggregateHuvudman(
  h: Huvudman,
  namedUnits: ListSchool[],
  form?: SkolformCode,
): HuvudmanAggregate {
  const units = namedUnits.filter(
    (s) => s.status === "Aktiv" && (!form || s.forms.includes(form)),
  );
  const elever = sumStudents(units, form);

  return {
    huvudman: h,
    units,
    enheter: units.length,
    elever,
  };
}

/**
 * What a huvudman column sorts on. `undefined` means the figure is not
 * reported, and those rows sort last whichever way the column points.
 *
 * Every key the list can actually be sorted by has a case. The default is a
 * guard, not a fallback: `resolveHuvudmanSort` in `query.ts` has already
 * rejected anything it does not recognise, so an unknown key here means a
 * column was added without being registered as sortable there. Returning
 * `undefined` sends every row to the same place, which reads as a sort that
 * did nothing — the old `return r.elever` read as a sort that worked.
 */
export function huvudmanSortValue(
  r: HuvudmanAggregate,
  key: string,
): string | number | undefined {
  switch (key) {
    case "name":
      return r.huvudman.name;
    case "typ":
      return r.huvudman.typ;
    case "koncern":
      return r.huvudman.koncern ?? undefined;
    case "enheter":
      return r.enheter;
    case "elever":
      return r.elever;
    default:
      return undefined;
  }
}

interface HuvudmanSelection {
  rows: HuvudmanAggregate[];
  counts: Record<HuvudmanTyp, number>;
  formCounts: Map<SkolformCode, number>;
  kommuner: KommunOption[];
  /** Huvudmän in scope before the type/koncern/search filters. */
  total: number;
}

export function selectHuvudman(
  everyHuvudman: Huvudman[],
  everySchool: ListSchool[],
  query: HuvudmanQuery,
): HuvudmanSelection {
  const form = query.skolform;

  // A kommun filter narrows the units first; the huvudmän are then whoever is
  // left running something there, so the list never shows a huvudman with a
  // zero everywhere.
  const schools = query.kommun
    ? everySchool.filter((s) => s.kommunkod === query.kommun)
    : everySchool;
  const namesInScope = new Set(schools.map((s) => s.huvudman));
  const all = query.kommun
    ? everyHuvudman.filter((h) => namesInScope.has(h.name))
    : everyHuvudman;

  // Units grouped by huvudman name in one pass. Both consumers below join on
  // that name — the aggregation and the form counts — and without the map
  // each did a full scan of the unit list per huvudman, ~13 M string
  // comparisons per keystroke across the two of them.
  const unitsByName = new Map<string, ListSchool[]>();
  for (const s of schools) {
    const group = unitsByName.get(s.huvudman);
    if (group) group.push(s);
    else unitsByName.set(s.huvudman, [s]);
  }

  const rows = all.map((h) => aggregateHuvudman(h, unitsByName.get(h.name) ?? [], form));

  const counts = Object.fromEntries(
    HUVUDMANTYP_ORDER.map((t) => [t, all.filter((h) => h.typ === t).length]),
  ) as Record<HuvudmanTyp, number>;

  // How many huvudmän would remain per skolform — the chip counts. Reads the
  // same `unitsByName` groups the aggregation built, instead of re-scanning
  // the unit list once per huvudman.
  const formCounts = new Map<SkolformCode, number>();
  for (const h of all) {
    const forms = new Set((unitsByName.get(h.name) ?? []).flatMap((s) => s.forms));
    for (const f of forms) formCounts.set(f, (formCounts.get(f) ?? 0) + 1);
  }

  let filtered = rows.filter((r) => query.typ.includes(r.huvudman.typ));
  // Selecting a skolform means "huvudmän who run it" — an aggregate with no
  // units in that form is not a result, it is an empty row.
  if (form) filtered = filtered.filter((r) => r.enheter > 0);
  if (query.koncernOnly) filtered = filtered.filter((r) => r.huvudman.koncern);
  // Folded once — see `selectSchools` for why the term arrives untrimmed.
  const needle = foldNeedle(query.q);
  if (needle) {
    filtered = filtered.filter(
      (r) => matches(r.huvudman.name, needle) || (r.huvudman.org ?? "").includes(needle),
    );
  }

  const byName = (a: HuvudmanAggregate, b: HuvudmanAggregate) =>
    a.huvudman.name.localeCompare(b.huvudman.name, "sv");

  const sorted = sortRows(
    filtered,
    (r) => huvudmanSortValue(r, query.sort),
    query.desc,
    byName,
  );

  return {
    rows: sorted,
    counts,
    formCounts,
    kommuner: listKommunOptions(everySchool),
    total: all.length,
  };
}

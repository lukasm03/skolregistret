import { skolform } from "@/config/skolformer";
import { kommunName } from "@/data/kommuner";
import { median } from "./format";
import type { HuvudmanQuery } from "./query";
import { metricNumberOf, studentsOf, type ListSchool } from "./school-fields";
import type { KommunOption } from "./school-select";
import type { Huvudman, HuvudmanTyp, SkolformCode } from "./types";

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
  /** Median on the selected skolform's leading measure; null without a form. */
  metric: number | null;
  /** Share of the kommun's pupils, in percent. */
  andel: number | null;
};

/** Elevtal summed over the units that are running. */
function sumStudents(units: ListSchool[], form?: SkolformCode): number {
  return units.reduce((sum, s) => sum + (studentsOf(s, form) ?? 0), 0);
}

function totalStudents(
  all: ListSchool[],
  form?: SkolformCode,
  kommunkod?: string,
): number {
  return sumStudents(
    all.filter(
      (s) =>
        s.status === "Aktiv" &&
        (!form || s.forms.includes(form)) &&
        (!kommunkod || s.kommunkod === kommunkod),
    ),
    form,
  );
}

/** Every kommun with units, for the dropdown. */
function listKommunOptions(all: ListSchool[]): KommunOption[] {
  const counts = new Map<string, number>();
  for (const s of all) {
    if (!s.kommunkod) continue;
    counts.set(s.kommunkod, (counts.get(s.kommunkod) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kod, count]) => ({ kod, name: kommunName(kod) ?? kod, count }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

function aggregateHuvudman(
  h: Huvudman,
  all: ListSchool[],
  total: number,
  form?: SkolformCode,
): HuvudmanAggregate {
  const units = all.filter(
    (s) =>
      s.huvudman === h.name && s.status === "Aktiv" && (!form || s.forms.includes(form)),
  );
  const elever = sumStudents(units, form);
  const def = form ? skolform(form) : undefined;
  const primaryKey = def?.headline[0];
  const values = primaryKey
    ? units
        .map((u) => metricNumberOf(u, form, primaryKey))
        .filter((m): m is number => m != null)
    : [];

  return {
    huvudman: h,
    units,
    enheter: units.length,
    elever,
    metric: primaryKey ? median(values) : null,
    andel: elever && total ? (elever / total) * 100 : null,
  };
}

/**
 * What a huvudman column sorts on. `undefined` means the figure is not
 * reported, and those rows sort last whichever way the column points.
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
    case "andel":
      return r.andel ?? undefined;
    case "metric":
      return r.metric ?? undefined;
    default:
      return r.elever;
  }
}

interface HuvudmanSelection {
  rows: HuvudmanAggregate[];
  counts: Record<HuvudmanTyp, number>;
  formCounts: Map<SkolformCode, number>;
  kommuner: KommunOption[];
  /** Huvudmän in scope before the type/koncern/search filters. */
  total: number;
  /** Elever in the kommun (or riket) within the selected skolform. */
  kommunElever: number;
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

  const kommunElever = totalStudents(everySchool, form, query.kommun);
  const rows = all.map((h) => aggregateHuvudman(h, schools, kommunElever, form));

  const counts = {
    Kommunal: all.filter((h) => h.typ === "Kommunal").length,
    Fristående: all.filter((h) => h.typ === "Fristående").length,
  };

  // How many huvudmän would remain per skolform — the chip counts.
  const formCounts = new Map<SkolformCode, number>();
  for (const h of all) {
    const forms = new Set(
      schools.filter((s) => s.huvudman === h.name).flatMap((s) => s.forms),
    );
    for (const f of forms) formCounts.set(f, (formCounts.get(f) ?? 0) + 1);
  }

  let filtered = rows.filter((r) => query.typ.includes(r.huvudman.typ));
  // Selecting a skolform means "huvudmän who run it" — an aggregate with no
  // units in that form is not a result, it is an empty row.
  if (form) filtered = filtered.filter((r) => r.enheter > 0);
  if (query.koncernOnly) filtered = filtered.filter((r) => r.huvudman.koncern);
  if (query.q) {
    const q = query.q.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.huvudman.name.toLowerCase().includes(q) || (r.huvudman.org ?? "").includes(q),
    );
  }

  const byName = (a: HuvudmanAggregate, b: HuvudmanAggregate) =>
    a.huvudman.name.localeCompare(b.huvudman.name, "sv");

  const sorted = [...filtered].sort((a, b) => {
    const av = huvudmanSortValue(a, query.sort);
    const bv = huvudmanSortValue(b, query.sort);
    if (av === undefined || bv === undefined) {
      if (av === bv) return byName(a, b);
      return av === undefined ? 1 : -1;
    }
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "sv");
    if (cmp === 0) return byName(a, b);
    return query.desc ? -cmp : cmp;
  });

  return {
    rows: sorted,
    counts,
    formCounts,
    kommuner: listKommunOptions(everySchool),
    total: all.length,
    kommunElever,
  };
}

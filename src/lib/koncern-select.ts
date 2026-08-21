import { skolformer } from "@/config/skolformer";
import type { KoncernQuery } from "./query";
import type { KoncernGroup } from "@/lib/skolregister";
import { sortRows } from "./sort-rows";
import type { SkolformCode } from "./types";

/** `HuvudmanRad.skolformer` carries the label (`"Grundskola"`), not the code. */
const codeForLabel = new Map(skolformer.map((f) => [f.label, f.code]));

/**
 * Filtering and sorting the koncern list, pure and free of I/O — same shape
 * as `huvudman-select.ts`, but there is nothing to aggregate here: each
 * koncern's `dotterbolag` already carries its own enheter/elever/kommuner,
 * summed straight from `buildKoncernGroups`.
 */

export type KoncernAggregate = {
  group: KoncernGroup;
  enheter: number;
  elever: number;
  kommuner: string[];
  skolformer: string[];
};

function aggregateKoncern(group: KoncernGroup): KoncernAggregate {
  const enheter = group.dotterbolag.reduce((sum, d) => sum + d.antalEnheter, 0);
  const elever = group.dotterbolag.reduce((sum, d) => sum + d.antalElever, 0);
  const kommuner = [...new Set(group.dotterbolag.flatMap((d) => d.kommuner))].sort(
    (a, b) => a.localeCompare(b, "sv"),
  );
  const skolformer = [...new Set(group.dotterbolag.flatMap((d) => d.skolformer))];
  return { group, enheter, elever, kommuner, skolformer };
}

/**
 * What a koncern column sorts on. `undefined` means the figure is not
 * reported, and those rows sort last whichever way the column points.
 */
export function koncernSortValue(
  r: KoncernAggregate,
  key: string,
): string | number | undefined {
  switch (key) {
    case "namn":
      return r.group.namn;
    case "enheter":
      return r.enheter;
    case "huvudman":
      return r.group.dotterbolag.length;
    case "kommuner":
      return r.kommuner.length;
    default:
      return r.elever;
  }
}

interface KoncernSelection {
  rows: KoncernAggregate[];
  /** How many koncerner remain per skolform — the sidebar's radio counts. */
  formCounts: Map<SkolformCode, number>;
  /** Koncerner in scope before any filter. */
  total: number;
}

export function selectKoncern(
  everyGroup: KoncernGroup[],
  query: KoncernQuery,
): KoncernSelection {
  const all = everyGroup.map(aggregateKoncern);

  const formCounts = new Map<SkolformCode, number>();
  for (const r of all) {
    const codes = new Set(
      r.skolformer.map((f) => codeForLabel.get(f)).filter((c): c is SkolformCode => !!c),
    );
    for (const code of codes) formCounts.set(code, (formCounts.get(code) ?? 0) + 1);
  }

  let filtered = all;
  if (query.skolform) {
    filtered = filtered.filter((r) =>
      r.skolformer.some((f) => codeForLabel.get(f) === query.skolform),
    );
  }
  if (query.minEnheter != null) {
    filtered = filtered.filter((r) => r.enheter >= query.minEnheter!);
  }
  if (query.maxEnheter != null) {
    filtered = filtered.filter((r) => r.enheter <= query.maxEnheter!);
  }
  if (query.minElever != null) {
    filtered = filtered.filter((r) => r.elever >= query.minElever!);
  }
  if (query.maxElever != null) {
    filtered = filtered.filter((r) => r.elever <= query.maxElever!);
  }
  // Trimmed and folded once — see `selectSchools` for why the term arrives
  // untrimmed.
  const needle = query.q.trim().toLowerCase();
  if (needle) {
    filtered = filtered.filter(
      (r) =>
        r.group.namn.toLowerCase().includes(needle) || r.group.orgNr.includes(needle),
    );
  }

  const byName = (a: KoncernAggregate, b: KoncernAggregate) =>
    a.group.namn.localeCompare(b.group.namn, "sv");

  const sorted = sortRows(
    filtered,
    (r) => koncernSortValue(r, query.sort),
    query.desc,
    byName,
  );

  return { rows: sorted, formCounts, total: all.length };
}

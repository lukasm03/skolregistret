import { skolformer } from "@/config/skolformer";
import { kommunName } from "@/data/kommuner";
import { slugify } from "@/lib/format";
import type { ListSchool } from "@/lib/school-fields";
import { dedupeHuvudmanRows, huvudmanSlugar } from "@/lib/huvudman-slugs";
import { formatYears } from "@/lib/skolverket/parse";
import type {
  HuvudmanTyp,
  MetricValue,
  SchoolFormStats,
  SkolformCode,
  Huvudman,
  SkolStatus,
} from "@/lib/types";
import type { HuvudmanRad, SkolorRad } from "@/lib/skolregister";

/**
 * Turns the register's rows into the shapes the list views already know how
 * to filter, sort and aggregate. Both `/skolor` and `/huvudman` normalize
 * through here — which is why this module imports nothing at runtime from
 * the register barrel: it runs in the browser, and a runtime reach into
 * `@/lib/skolregister` would drag `node:fs` into the client bundle
 * (Turbopack refuses exactly that). The types come in as `import type`, and
 * the slug machinery lives in `huvudman-slugs.ts`; resolving a URL against
 * the actual list is `getHuvudmanBySlug` in `skolregister/huvudman.ts`.
 *
 * The register reports no per-form metrics, grade spans or bokslut figures,
 * so those come back empty rather than guessed at — the views already treat
 * a missing figure as "not reported".
 */

/**
 * The subset of `SkolorRad` that actually crosses to the browser.
 *
 * The list pages hand the whole register to the client and filter there, so
 * every field costs 6 500 copies of itself in the RSC payload. Four of
 * `SkolorRad`'s fields earn none of that:
 *
 * - `huvudmannaOrgnr` and `antalEleverKälla` are read on the server only
 *   (`skola-detalj.ts`, `huvudman.ts`, `resources.ts`) and by nothing here.
 * - `kommun` is `kommunName(kommunkod)`, and the browser already has that
 *   table — `huvudman-select.ts` and `SchoolsView` both import it.
 * - `årskurser` is the sorted union of `årskurserPerSkolform`, which ships
 *   anyway because the skolform re-keying needs it.
 *
 * Dropping them takes `/skolor` from 3.16 MB to 2.40 MB. `normalizeApiSchool`
 * rebuilds the two derivable ones, so `ListSchool` is unchanged — keep the
 * projection and the normalizer in step, since a field added to one and not
 * the other either ships unread or is read unshipped.
 *
 * `SkolorRad` is assignable to this, so server-side callers that hold a full
 * row (the huvudman detail page) can keep passing it straight in.
 */
export interface ListSchoolPayload {
  skolenhetskod: string;
  namn: string;
  status: string;
  huvudman: string;
  huvudmannatyp: string;
  kommunkod: string | null;
  skolformer: string[];
  gymnasieprogram: string[];
  antalElever: number | null;
  årskurserPerSkolform: { kod: string; skolform: string; årskurser: string[] }[];
}

/** `SkolorRad[]` trimmed to what the browser reads — see `ListSchoolPayload`. */
export function toListSchoolPayload(rows: SkolorRad[]): ListSchoolPayload[] {
  return rows.map((r) => ({
    skolenhetskod: r.skolenhetskod,
    namn: r.namn,
    status: r.status,
    huvudman: r.huvudman,
    huvudmannatyp: r.huvudmannatyp,
    kommunkod: r.kommunkod,
    skolformer: r.skolformer,
    gymnasieprogram: r.gymnasieprogram,
    antalElever: r.antalElever,
    årskurserPerSkolform: r.årskurserPerSkolform,
  }));
}

/**
 * The subset of `HuvudmanRad` that crosses to the browser — same idea as
 * `ListSchoolPayload`, and a bigger cut, because most of what a full row
 * carries is server-side detail the list never shows:
 *
 * - `koncern.träd` is the whole rebuilt ownership tree, one per huvudman;
 *   `/huvudman` only reads the koncern's name for its column and filter.
 * - `kommuner`, `skolformer`, `antalEnheter` and `antalElever` are
 *   precomputed register aggregates that the view ignores — it re-derives
 *   all of them from the unit list, which ships alongside anyway because
 *   the aggregation needs unit-level figures no row summary can answer
 *   (per-kommun narrowing above all).
 * - `bolagsform` is read by the detail page only.
 */
export interface ListHuvudmanPayload {
  organisationsnummer: string;
  namn: string;
  typ: string;
  koncern: { koncernNamn: string } | null;
}

/** `HuvudmanRad[]` trimmed to what the browser reads — see `ListHuvudmanPayload`. */
export function toListHuvudmanPayload(rows: HuvudmanRad[]): ListHuvudmanPayload[] {
  return rows.map((r) => ({
    organisationsnummer: r.organisationsnummer,
    namn: r.namn,
    typ: r.typ,
    koncern: r.koncern ? { koncernNamn: r.koncern.koncernNamn } : null,
  }));
}

const skolformCodeFromLabel = (label: string): SkolformCode | undefined =>
  skolformer.find((form) => form.label === label)?.code;

/**
 * The register keys årskurser by Skolverket's own skolformsnyckel, which is a
 * different vocabulary from this app's `SkolformCode`. Only these three forms
 * report years at all.
 */
const ÅRSKURS_KOD_TILL_SKOLFORM: Partial<Record<string, SkolformCode>> = {
  fsk: "FKLASS",
  gr: "GR",
  gran: "GRS",
  sp: "SP",
  sam: "SAM",
};

const toMetricValue = (value: number | null): MetricValue | null =>
  value == null ? null : { raw: String(value), value, missing: null };

export function normalizeApiSchool(school: ListSchoolPayload): ListSchool {
  const forms: SkolformCode[] = [];
  const otherForms: string[] = [];
  for (const rawForm of school.skolformer ?? []) {
    const code = skolformCodeFromLabel(rawForm);
    if (code) forms.push(code);
    else otherForms.push(rawForm);
  }

  // Years arrive keyed by Skolverket's skolformsnyckel; re-key them onto the
  // app's own codes so `stats[form]` can carry them. A form the register
  // reports no years for keeps an empty array — "not reported", not "none".
  const yearsByForm = new Map<SkolformCode, string[]>();
  for (const entry of school.årskurserPerSkolform ?? []) {
    const code = ÅRSKURS_KOD_TILL_SKOLFORM[entry.kod];
    if (code) yearsByForm.set(code, entry.årskurser ?? []);
  }

  // The two fields describing which forms a unit runs are maintained
  // separately, and this is hand-entered public data: a unit can report
  // årskurser for a skolform its `skolformer` list omits. Reported years are
  // evidence the unit runs that form, so recover it rather than dropping the
  // years — otherwise the unit is unfindable under a form it demonstrably
  // teaches. An empty array is "not reported" and evidence of nothing, so it
  // recovers nothing. Declared forms stay first; recovered ones follow.
  for (const [form, formYears] of yearsByForm) {
    if (formYears.length && !forms.includes(form)) forms.push(form);
  }

  const stats: Partial<Record<SkolformCode, SchoolFormStats>> = {};
  for (const form of forms) {
    const years = yearsByForm.get(form) ?? [];
    stats[form] = {
      years,
      gradeSpan: formatYears(years),
      students: toMetricValue(school.antalElever),
      metrics: {},
    };
  }

  // Rebuilt rather than shipped: the same union `byggSkolorRad` computes for
  // `SkolorRad.årskurser`, from the per-form lists that travel anyway.
  const years = [...new Set([...yearsByForm.values()].flat())].sort(
    (a, b) => Number(a) - Number(b),
  );

  return {
    kod: school.skolenhetskod,
    // The register isn't always internally consistent — a unit with no name
    // has been seen despite the declared type; sorting needs a string.
    name: school.namn ?? "",
    huvudman: school.huvudman ?? "",
    typ: school.huvudmannatyp as HuvudmanTyp,
    status: school.status as SkolStatus,
    kommunkod: school.kommunkod,
    // Resolved here rather than shipped — the browser holds the same table.
    kommun: kommunName(school.kommunkod),
    forms,
    otherForms,
    stats,
    students: school.antalElever,
    years,
    gradeSpan: formatYears(years),
    programmes: school.gymnasieprogram ?? [],
  };
}

/**
 * The list rows as the browser reads them. The slug comes from
 * `huvudmanSlugar` rather than from `slugify` at the call site, so a
 * disambiguated address is the same string here, in `generateStaticParams`
 * and in the `?huvudman=` filter.
 */
export function normalizeApiHuvudmanList(rows: ListHuvudmanPayload[]): Huvudman[] {
  const slugFörNamn = huvudmanSlugar(rows);
  return dedupeHuvudmanRows(rows).map((h) => ({
    slug: slugFörNamn.get(h.namn) ?? slugify(h.namn),
    name: h.namn,
    typ: h.typ as HuvudmanTyp,
    org: h.organisationsnummer,
    koncern: h.koncern?.koncernNamn ?? null,
  }));
}

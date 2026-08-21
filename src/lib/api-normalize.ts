import { skolformer } from "@/config/skolformer";
import { kommunName } from "@/data/kommuner";
import { slugify } from "@/lib/format";
import type { ListSchool } from "@/lib/school-fields";
import { listHuvudman, type HuvudmanRad, type SkolorRad } from "@/lib/skolregister";
import { formatYears } from "@/lib/skolverket/parse";
import type {
  HuvudmanTyp,
  MetricValue,
  SchoolFormStats,
  SkolformCode,
  Huvudman,
  SkolStatus,
} from "@/lib/types";

/**
 * Turns the live skolregister API's rows into the shapes the list views
 * already know how to filter, sort and aggregate. Both `/skolor` and
 * `/huvudman` normalize through here.
 *
 * The API reports no per-form metrics, grade spans or bokslut figures, so
 * those come back empty rather than guessed at — the views already treat a
 * missing figure as "not reported".
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
 * Every huvudman's address, keyed by the name the units join on.
 *
 * `slugify` folds accents, so two genuinely different huvudmän can land on
 * one slug: the register carries both `HÅBO KOMMUN` (Uppsala län) and
 * `HABO KOMMUN` (Jönköpings län), and both slug as `habo-kommun`. Before
 * this map existed the two resolvers disagreed about which one won —
 * `/huvudman/habo-kommun` rendered Håbo while `/skolor?huvudman=habo-kommun`
 * filtered on Habo's name — so Håbo's own "visa alla skolenheter" link
 * listed the other kommun's schools and Habo had no reachable page at all.
 *
 * The tie is broken on organisationsnummer rather than on list order: the
 * lowest orgnr keeps the bare slug and the rest take their orgnr as a
 * suffix, so an address stays put even if the collector reorders its export.
 * Rows sharing a name are one huvudman as far as the join is concerned and
 * get one slug between them — see `dedupeHuvudmanRows`.
 *
 * Generic over the row shape: it needs only a name and an orgnr, so it runs
 * unchanged on both full `HuvudmanRad`s and the `ListHuvudmanPayload` rows
 * the list pages ship.
 */
export function huvudmanSlugar<T extends { namn: string; organisationsnummer: string }>(
  rows: T[],
): Map<string, string> {
  const perSlug = new Map<string, T[]>();
  for (const row of dedupeHuvudmanRows(rows)) {
    const slug = slugify(row.namn);
    const grupp = perSlug.get(slug);
    if (grupp) grupp.push(row);
    else perSlug.set(slug, [row]);
  }

  const slugFörNamn = new Map<string, string>();
  for (const [slug, grupp] of perSlug) {
    if (grupp.length === 1) {
      slugFörNamn.set(grupp[0]!.namn, slug);
      continue;
    }
    const ordnade = [...grupp].sort((a, b) =>
      a.organisationsnummer.localeCompare(b.organisationsnummer),
    );
    ordnade.forEach((row, i) => {
      slugFörNamn.set(
        row.namn,
        i === 0 ? slug : `${slug}-${slugify(row.organisationsnummer)}`,
      );
    });
  }
  return slugFörNamn;
}

/**
 * The reverse of `huvudmanSlugar`, for resolving a URL back to its row.
 *
 * Memoized on the array itself: `listHuvudman()` hands out one cached array
 * per process and `getHuvudmanBySlug` runs twice for each of the thousand
 * huvudman pages a build prerenders, so rebuilding the index every time is
 * a thousand needless passes over the whole list. A `WeakMap` keyed on the
 * rows needs no invalidation — a new array is a new index by construction.
 */
const slugIndexPerRows = new WeakMap<HuvudmanRad[], Map<string, HuvudmanRad>>();

export function huvudmanRadFörSlug(rows: HuvudmanRad[]): Map<string, HuvudmanRad> {
  const memo = slugIndexPerRows.get(rows);
  if (memo) return memo;

  const slugFörNamn = huvudmanSlugar(rows);
  const index = new Map<string, HuvudmanRad>();
  for (const row of dedupeHuvudmanRows(rows)) {
    const slug = slugFörNamn.get(row.namn);
    if (slug) index.set(slug, row);
  }
  slugIndexPerRows.set(rows, index);
  return index;
}

/**
 * Two rows carrying the *same* name are one huvudman to every consumer of
 * this list: `aggregateHuvudman` joins units by name, so both rows would
 * aggregate the identical unit set and render as duplicate lines. Collapsing
 * to the first occurrence keeps the list to one row per name.
 *
 * Only exact names collapse. Two rows that merely slugify alike are two
 * huvudmän with two unit sets, and dropping one of those was the Håbo/Habo
 * bug — `huvudmanSlugar` gives them separate addresses instead.
 */
export function dedupeHuvudmanRows<T extends { namn: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    if (seen.has(row.namn)) continue;
    seen.add(row.namn);
    result.push(row);
  }
  return result;
}

/**
 * The one place a `/huvudman/[slug]` URL resolves to its row — `generateMetadata`
 * and the page both resolve through this, so a title can never describe a
 * different huvudman than the one rendered. `null` when no row carries the
 * slug, which the route answers with not-found.
 */
export async function getHuvudmanBySlug(slug: string): Promise<HuvudmanRad | null> {
  return huvudmanRadFörSlug(await listHuvudman()).get(slug) ?? null;
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

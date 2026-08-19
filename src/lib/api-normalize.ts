import { skolformer } from "@/config/skolformer";
import { slugify } from "@/lib/format";
import type { ListSchool } from "@/lib/school-fields";
import type { HuvudmanRad, SkolorRad } from "@/lib/skolregister";
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

export function normalizeApiSchool(school: SkolorRad): ListSchool {
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

  const years = school.årskurser ?? [];

  return {
    kod: school.skolenhetskod,
    // The register isn't always internally consistent — a unit with no name
    // has been seen despite the declared type; sorting needs a string.
    name: school.namn ?? "",
    huvudman: school.huvudman ?? "",
    typ: school.huvudmannatyp as HuvudmanTyp,
    status: school.status as SkolStatus,
    kommunkod: school.kommunkod,
    kommun: school.kommun,
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
 * The slug is derived, not sent by the API — `/huvudman/[slug]` derives it the
 * same way from the huvudman name, so the two stay linkable.
 */
function normalizeApiHuvudman(h: HuvudmanRad): Huvudman {
  return {
    slug: slugify(h.namn),
    name: h.namn,
    typ: h.typ as HuvudmanTyp,
    org: h.organisationsnummer,
    koncern: h.koncern?.koncernNamn ?? null,
  };
}

/**
 * `aggregateHuvudman` joins units to a huvudman by name alone (the API has no
 * other shared key), so two rows with the same name — a pagination overlap,
 * or genuinely distinct organisationsnummer sharing a brand name — would
 * aggregate identical unit sets and collide on `slug`. Collapsing to the
 * first occurrence keeps the list to one row per name, matching how the join
 * already treats them. `/huvudman/[slug]` dedupes the same way so the two
 * pages agree on which row a slug resolves to.
 */
export function dedupeHuvudmanRows(rows: HuvudmanRad[]): HuvudmanRad[] {
  const seen = new Set<string>();
  const result: HuvudmanRad[] = [];
  for (const row of rows) {
    const key = slugify(row.namn);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

export function normalizeApiHuvudmanList(rows: HuvudmanRad[]): Huvudman[] {
  return dedupeHuvudmanRows(rows).map(normalizeApiHuvudman);
}

import { skolformer } from "@/config/skolformer";
import { slugify } from "@/lib/format";
import type { ListSchool } from "@/lib/school-fields";
import type { HuvudmanRad, SkolorRad } from "@/lib/skolregister";
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

  const stats: Partial<Record<SkolformCode, SchoolFormStats>> = {};
  for (const form of forms) {
    stats[form] = {
      gradeSpan: "",
      students: toMetricValue(school.antalElever),
      metrics: {},
    };
  }

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
    gradeSpan: "",
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

/** One koncern with every huvudman in the register that belongs to it. */
interface KoncernGroup {
  /** URL segment, derived the same way huvudman slugs are. */
  slug: string;
  namn: string;
  orgNr: string;
  /**
   * The koncern's total company count as Bolagsverket reports it — often
   * bigger than `dotterbolag.length`, since most of a koncern's companies
   * are holding companies or run nothing in the school register.
   */
  antalFöretag: number;
  dotterbolag: HuvudmanRad[];
}

/**
 * Huvudmän grouped by koncern, keyed by `koncernNamn` for the same reason
 * `dedupeHuvudmanRows` keys on name — the API gives no other id every row
 * agrees on, and the app's routing is name-based throughout.
 */
export function groupKoncern(rows: HuvudmanRad[]): KoncernGroup[] {
  const groups = new Map<string, KoncernGroup>();
  for (const row of dedupeHuvudmanRows(rows)) {
    const k = row.koncern;
    // The register isn't always internally consistent — a `koncern` block
    // with no name has been seen in the wild despite the declared type.
    if (!k || !k.koncernNamn) continue;
    const slug = slugify(k.koncernNamn);
    const existing = groups.get(slug);
    if (existing) existing.dotterbolag.push(row);
    else
      groups.set(slug, {
        slug,
        namn: k.koncernNamn,
        orgNr: k.koncernOrgNr,
        antalFöretag: k.antalFöretag,
        dotterbolag: [row],
      });
  }
  return [...groups.values()];
}

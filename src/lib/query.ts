import {
  baseHuvudmanSorts,
  baseSchoolSorts,
  site,
} from "@/config/site";
import { skolform, type SkolformDef } from "@/config/skolformer";
import { normalizeKommunkod } from "@/data/kommuner";
import {
  DEFAULT_STATUS,
  isSkolformCode,
  isSkolStatus,
  SKOLSTATUS_ORDER,
  type HuvudmanTyp,
  type SkolformCode,
  type SkolStatus,
} from "./types";

/** Next.js gives search params as string | string[] | undefined. */
export type RawParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

const list = (v: string | string[] | undefined): string[] => {
  const s = one(v);
  if (!s) return [];
  return s.split(",").filter(Boolean);
};

const int = (v: string | string[] | undefined): number | undefined => {
  const s = one(v);
  if (s == null || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const ALL_TYPER: HuvudmanTyp[] = ["Kommunal", "Fristående"];

/** Årskurs chips shown when no single skolform is selected. */
const DEFAULT_GRADE_FILTER = ["F", "1–3", "4–6", "7–9"];

interface SortOption {
  /** Also the id of the table column this sorts. */
  key: string;
  label: string;
  /** The direction the label describes — used when the URL names no other. */
  desc: boolean;
}

/**
 * Sort options for the selected skolform: the generic ones plus that form's
 * headline measures. With no form selected there is nothing comparable across
 * forms, so only the generic ones are offered.
 */
function schoolSortsFor(form: SkolformDef | undefined): SortOption[] {
  const base: SortOption[] = baseSchoolSorts.map((s) => ({ ...s }));
  if (!form) return base;
  const metrics = form.headline
    .map((key) => form.metrics.find((m) => m.key === key))
    .filter((m): m is NonNullable<typeof m> => m != null)
    .map((m) => ({
      key: m.key,
      label:
        m.higherIsBetter === false
          ? `${m.label}, lägst först`
          : `${m.label}, högst först`,
      desc: m.higherIsBetter !== false,
    }));
  return [base[0], ...metrics, ...base.slice(1)];
}

/**
 * Columns that are not offered in the toolbar's sort menu but can still be
 * sorted by clicking their header. They keep the sort valid in the URL so a
 * link to "sorted by huvudman" survives a reload.
 */
const EXTRA_SCHOOL_SORTS: SortOption[] = [
  { key: "huvudman", label: "Huvudman A–Ö", desc: false },
  { key: "kommun", label: "Kommun A–Ö", desc: false },
  { key: "status", label: "Status A–Ö", desc: false },
];

function resolveSchoolSort(
  sort: string | undefined,
  form: SkolformDef | undefined,
): SortOption {
  const options = schoolSortsFor(form);
  return (
    options.find((o) => o.key === sort) ??
    EXTRA_SCHOOL_SORTS.find((o) => o.key === sort) ??
    options[0]
  );
}

/** Årskurs chips valid for the selected skolform. */
export function gradeFilterFor(form: SkolformDef | undefined): string[] {
  return form ? form.gradeFilter : DEFAULT_GRADE_FILTER;
}

export interface SchoolQuery {
  q: string;
  /** Huvudman slug the list is filtered to. */
  huvudman?: string;
  /** Kommunkod the list is filtered to; undefined means hela riket. */
  kommun?: string;
  typ: HuvudmanTyp[];
  /** Selected skolform; undefined means "alla skolformer". */
  skolform?: SkolformCode;
  arskurs: string[];
  /** Programme names to filter on — only meaningful for gymnasieskola. */
  program: string[];
  /**
   * Driftstatus to include. Absent from the URL means `DEFAULT_STATUS`
   * (running units only); an explicitly empty `?status=` means none, and the
   * list is empty — the checkboxes then say what they mean.
   */
  status: SkolStatus[];
  minElever?: number;
  maxElever?: number;
  /** Validated against the selected skolform — see `resolveSchoolSort`. */
  sort: string;
  /** Direction the sort runs in. Clicking a column header sets this. */
  desc: boolean;
  page: number;
  perPage: number;
}

/**
 * `?status=` distinguishes three cases that a plain list cannot: absent is the
 * default, empty is "nothing selected", and a list is that list. The old
 * `?planerad=1` toggle is still honoured as "show every status", so links
 * shared before the status filter existed keep working.
 */
function parseStatus(params: RawParams): SkolStatus[] {
  const raw = one(params.status);
  if (raw === undefined) {
    return one(params.planerad) === "1"
      ? [...SKOLSTATUS_ORDER]
      : [...DEFAULT_STATUS];
  }
  return list(raw).filter(isSkolStatus);
}

/**
 * `?typ=` distinguishes absent (default: both types) from explicitly empty
 * (neither type, so nothing should match) — same idea as `parseStatus`.
 */
function parseTyp(params: RawParams): HuvudmanTyp[] {
  const raw = one(params.typ);
  if (raw === undefined) return ALL_TYPER;
  return list(raw).filter((t): t is HuvudmanTyp =>
    (ALL_TYPER as string[]).includes(t),
  );
}

export function parseSchoolQuery(params: RawParams): SchoolQuery {
  const typ = parseTyp(params);
  const rawForm = one(params.skolform)?.toUpperCase();
  const form =
    rawForm && isSkolformCode(rawForm) ? (rawForm as SkolformCode) : undefined;
  const def = form ? skolform(form) : undefined;
  const perPage = int(params.perPage);
  const sort = resolveSchoolSort(one(params.sort), def);
  const dir = one(params.dir);

  return {
    q: one(params.q)?.trim() ?? "",
    huvudman: one(params.huvudman),
    kommun: normalizeKommunkod(one(params.kommun)) ?? undefined,
    typ,
    skolform: form,
    arskurs: list(params.arskurs).filter((a) =>
      gradeFilterFor(def).includes(a),
    ),
    // Programme names are free text from the register, not a fixed enum, so
    // unlike arskurs there is nothing to validate against here.
    program: form === "GY" ? list(params.program) : [],
    status: parseStatus(params),
    minElever: int(params.min),
    maxElever: int(params.max),
    sort: sort.key,
    desc: dir === "asc" ? false : dir === "desc" ? true : sort.desc,
    page: Math.max(1, int(params.page) ?? 1),
    perPage:
      perPage && (site.pagination.perPageOptions as readonly number[]).includes(perPage)
        ? perPage
        : site.pagination.perPage,
  };
}

export interface HuvudmanQuery {
  q: string;
  /** Kommunkod the aggregation is restricted to; undefined means hela riket. */
  kommun?: string;
  typ: HuvudmanTyp[];
  /** Restricts the aggregation to units in one skolform. */
  skolform?: SkolformCode;
  /** Only show huvudmän that belong to a koncern. */
  koncernOnly: boolean;
  /** A column id: one of `baseHuvudmanSorts` or any sortable column header. */
  sort: string;
  desc: boolean;
  page: number;
  perPage: number;
}

/** Columns sortable by header click but absent from the toolbar's menu. */
const EXTRA_HUVUDMAN_SORTS: SortOption[] = [
  { key: "typ", label: "Typ A–Ö", desc: false },
  { key: "koncern", label: "Koncern A–Ö", desc: false },
  { key: "andel", label: "Andel elever, störst först", desc: true },
  { key: "metric", label: "Median, högst först", desc: true },
];

function resolveHuvudmanSort(sort: string | undefined): SortOption {
  return (
    baseHuvudmanSorts.find((s) => s.key === sort) ??
    EXTRA_HUVUDMAN_SORTS.find((s) => s.key === sort) ??
    baseHuvudmanSorts[0]
  );
}

export function parseHuvudmanQuery(params: RawParams): HuvudmanQuery {
  const typ = parseTyp(params);
  const rawForm = one(params.skolform)?.toUpperCase();
  const sort = resolveHuvudmanSort(one(params.sort));
  const dir = one(params.dir);
  const perPage = int(params.perPage);
  return {
    q: one(params.q)?.trim() ?? "",
    kommun: normalizeKommunkod(one(params.kommun)) ?? undefined,
    typ,
    skolform:
      rawForm && isSkolformCode(rawForm) ? (rawForm as SkolformCode) : undefined,
    koncernOnly: one(params.koncern) === "1",
    sort: sort.key,
    desc: dir === "asc" ? false : dir === "desc" ? true : sort.desc,
    page: Math.max(1, int(params.page) ?? 1),
    perPage:
      perPage && (site.pagination.perPageOptions as readonly number[]).includes(perPage)
        ? perPage
        : site.pagination.perPage,
  };
}

/**
 * Build a href from the current params plus a patch. `null` removes a key.
 * Used by every filter control, which keeps the whole list UI as plain links
 * — server-rendered, shareable, and working without client JavaScript.
 */
export function href(
  pathname: string,
  current: RawParams,
  patch: Record<string, string | number | null | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const s = one(v);
    if (s) sp.set(k, s);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") sp.delete(k);
    else sp.set(k, String(v));
  }
  // Any change to a filter puts you back on the first page.
  if (!("page" in patch)) sp.delete("page");
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Toggle one value inside a comma-separated multi-select param. Unchecking
 * the last remaining value drops the param (meaning "not set", i.e. "all")
 * unless `keepEmpty` is set, in which case it stays an explicit empty string
 * — for typ and status, "none selected" and "not set" mean different things.
 */
export function toggleInList(
  current: string[],
  value: string,
  keepEmpty?: boolean,
): string | null {
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  if (next.length) return next.join(",");
  return keepEmpty ? "" : null;
}

/**
 * Same, but an empty result stays an empty string instead of dropping the
 * param — for status, "none selected" and "not set" mean different things.
 */
export function toggleStatus(current: SkolStatus[], value: SkolStatus): string {
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : SKOLSTATUS_ORDER.filter((s) => s === value || current.includes(s));
  return next.join(",");
}

/**
 * The client-side counterpart of `href`: applies a patch to the current params
 * without building a URL. `null` removes a key, `""` keeps it as an explicit
 * empty value, and any change other than paging returns to page 1.
 */
export function patchParams(
  current: RawParams,
  patch: Record<string, string | number | null | undefined>,
): RawParams {
  const next: RawParams = {};
  for (const [k, v] of Object.entries(current)) {
    const s = one(v);
    if (s !== undefined) next[k] = s;
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete next[k];
    else next[k] = String(v);
  }
  if (!("page" in patch)) delete next.page;
  return next;
}

/** Params back to a "?a=b" suffix, keeping explicit empty values. */
export function searchString(params: RawParams): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const s = one(v);
    if (s !== undefined) sp.set(k, s);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/** Read the browser's query string back into params — for popstate. */
export function paramsFromSearch(search: string): RawParams {
  return Object.fromEntries(new URLSearchParams(search).entries());
}

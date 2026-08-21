import type { MetricUnit } from "@/config/skolformer";
import { site } from "@/config/site";
import type { MetricValue } from "./types";

export const DASH = site.dash;

/** Swedish thousands grouping. */
export function num(n: number | null | undefined): string {
  if (n == null) return DASH;
  return n.toLocaleString("sv-SE");
}

/** One decimal, Swedish comma. */
const decFormat = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function dec(n: number | null | undefined): string {
  if (n == null) return DASH;
  return decFormat.format(n);
}

/**
 * An ISO timestamp as a plain Swedish date.
 *
 * `timeZone: "UTC"` on purpose: these are dates the collector stamped on a
 * file, not moments in the reader's own day, and letting the rendering
 * machine's zone carry one across midnight would misreport when the register
 * was built. A value that does not parse is passed through rather than shown
 * as "Invalid Date".
 */
const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "UTC" });

export function isoDate(value: string | null | undefined): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormat.format(parsed);
}

function pct(n: number | null | undefined): string {
  if (n == null) return DASH;
  return `${dec(n)}%`;
}

const UNIT_SUFFIX: Record<MetricUnit, string> = {
  index: "",
  percent: "%",
  ratio: "",
  count: "",
};

/**
 * Render a figure using the register's own Swedish string. Reformatting the
 * parsed number would quietly drop what the API actually said — "cirka 360" is
 * a rounded figure and should not be shown as an exact 360.
 */
export function metric(
  v: MetricValue | null | undefined,
  unit: MetricUnit = "index",
): string {
  if (!v || v.missing != null || !v.raw) return DASH;
  return `${v.raw}${UNIT_SUFFIX[unit]}`;
}

/** Same as `metric`, for a plain number that did not come from the register. */
export function metricNumber(n: number | null, unit: MetricUnit): string {
  if (n == null) return DASH;
  return unit === "percent" ? pct(n) : dec(n);
}

/** A byte count rendered compactly: "512 B", "128 kB", "2,4 MB" — the value
 *  and its unit joined by a non-breaking space so they never split. */
export function bytes(n: number | null): string {
  if (n == null) return DASH;
  if (n < 1024) return `${n}\u00A0B`;
  const kb = n / 1024;
  return kb < 1024 ? `${Math.round(kb)}\u00A0kB` : `${dec(kb / 1024)}\u00A0MB`;
}

/**
 * A difference with its sign spelled out: "+2,3", "−1,4", "±0". The minus is
 * U+2212, which is the width of a digit — a hyphen would leave the column of
 * figures visibly ragged.
 *
 * Deliberately unsigned by direction: whether a difference is good news
 * depends on the measure (fewer elever per lärare, more behöriga lärare), and
 * a register reports rather than grades.
 */
export function signed(n: number | null | undefined): string {
  if (n == null) return DASH;
  const rounded = Number(n.toFixed(1));
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${dec(Math.abs(rounded))}`;
}

/** "1 skolenhet" / "12 skolenheter". */
export function plural(n: number, one: string, many: string): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

/**
 * "Båstad" → "Båstads kommun", "Vännäs" → "Vännäs kommun". Swedish drops the
 * genitive -s after s, x and z, which is how the kommuner spell themselves.
 */
export function kommunLong(name: string): string {
  return `${/[sxz]$/i.test(name) ? name : `${name}s`} kommun`;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * A name as it appears in a URL: lowercased, accents folded away, everything
 * else collapsed to single hyphens.
 *
 * The fold is Unicode decomposition (NFD) with the combining marks dropped,
 * which is what gives å/ä → `a` and ö → `o` — the spelling Swedish sites use
 * for a slug. Doing it that way rather than with a three-character lookup is
 * what keeps `é` from becoming a hyphen: `FREINÉTSKOLAN` used to slug as
 * `frein-tskolan`, and five huvudmän in the register carry an acute.
 *
 * A few letters are not decomposable and still need spelling out — `ø` and
 * `æ` carry their stroke and ligature inside the code point, so NFD leaves
 * them whole and the non-alphanumeric sweep would eat them.
 *
 * Distinct names can still land on the same slug (`HÅBO`/`HABO` both give
 * `habo-kommun`), so a caller that needs a unique address per row has to
 * disambiguate — see `huvudmanSlugar` in `huvudman-slugs.ts`.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

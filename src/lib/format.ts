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
export function dec(n: number | null | undefined): string {
  if (n == null) return DASH;
  return n.toFixed(1).replace(".", ",");
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

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

import type { SkolformCode } from "@/lib/types";

/**
 * The skolform registry. This is the file that makes the app work for more
 * than grundskolan: filter chips, table columns, stat tiles, sort options,
 * kommunmedianer and the detail comparison are all generated from it.
 *
 * Adding a skolform is adding an entry here. Adding a measure to an existing
 * skolform is adding a `MetricDef` — nothing else needs to change.
 */

export type MetricUnit =
  /** Meritvärde and similar unbounded indices. */
  | "index"
  /** 0–100, rendered with a % sign. */
  | "percent"
  /** Quotas like elever per lärare. */
  | "ratio"
  /** Whole numbers. */
  | "count";

interface MetricDef {
  /** Stable key used in URLs (?sort=) and as a column key. */
  key: string;
  /** Full label, used on the detail page. */
  label: string;
  /** Column header — kept short enough for a table. */
  short: string;
  unit: MetricUnit;
  /** Higher is better. Drives ranking direction; null means "no direction". */
  higherIsBetter: boolean | null;
}

export interface SkolformDef {
  code: SkolformCode;
  label: string;
  /** Short label for chips and columns. */
  short: string;
  /** Årskurs chips offered when this form is selected. Empty = no chips. */
  gradeFilter: string[];
  /** Metric keys that get a list column and a stat tile, in order. */
  headline: string[];
  metrics: MetricDef[];
}

/** Present at every form that has staff — safe to reuse. */
const staffMetrics: MetricDef[] = [
  {
    key: "behoriga",
    label: "Behöriga lärare",
    short: "Behöriga",
    unit: "percent",
    higherIsBetter: true,
  },
  {
    key: "elevPerLarare",
    label: "Elever per lärare",
    short: "Elever/lärare",
    unit: "ratio",
    higherIsBetter: false,
  },
];

export const skolformer: SkolformDef[] = [
  {
    code: "FKLASS",
    label: "Förskoleklass",
    short: "Förskoleklass",
    gradeFilter: [],
    headline: ["behoriga", "elevPerLarare"],
    metrics: [...staffMetrics],
  },
  {
    code: "GR",
    label: "Grundskola",
    short: "Grundskola",
    gradeFilter: ["F", "1–3", "4–6", "7–9"],
    headline: ["merit", "behoriga"],
    metrics: [
      {
        key: "merit",
        label: "Meritvärde åk 9",
        short: "Meritvärde",
        unit: "index",
        higherIsBetter: true,
      },
      ...staffMetrics,
      {
        key: "godkant9",
        label: "Godkänt i alla ämnen, åk 9",
        short: "Godkänt åk 9",
        unit: "percent",
        higherIsBetter: true,
      },
      {
        key: "godkant6",
        label: "Godkänt i alla ämnen, åk 6",
        short: "Godkänt åk 6",
        unit: "percent",
        higherIsBetter: true,
      },
      {
        key: "behorigYrke",
        label: "Behöriga till yrkesprogram",
        short: "Beh. yrkesprog.",
        unit: "percent",
        higherIsBetter: true,
      },
      {
        key: "behorigNat",
        label: "Behöriga till naturvetenskaps- och teknikprogram",
        short: "Beh. NA/TE",
        unit: "percent",
        higherIsBetter: true,
      },
      {
        key: "npSve9",
        label: "Nationellt prov svenska, åk 9",
        short: "NP svenska",
        unit: "index",
        higherIsBetter: true,
      },
      {
        key: "npMa9",
        label: "Nationellt prov matematik, åk 9",
        short: "NP matematik",
        unit: "index",
        higherIsBetter: true,
      },
      {
        key: "npEng9",
        label: "Nationellt prov engelska, åk 9",
        short: "NP engelska",
        unit: "index",
        higherIsBetter: true,
      },
      {
        key: "speciallarare",
        label: "Speciallärartjänster",
        short: "Speciallärare",
        unit: "ratio",
        higherIsBetter: null,
      },
    ],
  },
  {
    code: "GRS",
    label: "Anpassad grundskola",
    short: "Anpassad gr.",
    gradeFilter: ["1–3", "4–6", "7–9"],
    headline: ["behoriga", "elevPerLarare"],
    metrics: [...staffMetrics],
  },
  {
    code: "SP",
    label: "Specialskola",
    short: "Specialskola",
    gradeFilter: ["1–3", "4–6", "7–9"],
    headline: ["behoriga", "elevPerLarare"],
    metrics: [...staffMetrics],
  },
  {
    code: "SAM",
    label: "Sameskola",
    short: "Sameskola",
    gradeFilter: ["1–3", "4–6"],
    headline: ["behoriga", "elevPerLarare"],
    metrics: [...staffMetrics],
  },
  {
    code: "GY",
    label: "Gymnasieskola",
    short: "Gymnasium",
    gradeFilter: [],
    headline: ["betygspoang", "examen"],
    metrics: [
      {
        key: "betygspoang",
        label: "Genomsnittlig betygspoäng",
        short: "Betygspoäng",
        unit: "index",
        higherIsBetter: true,
      },
      {
        key: "examen",
        label: "Examen inom 3 år",
        short: "Examensgrad",
        unit: "percent",
        higherIsBetter: true,
      },
      {
        key: "hogskolebehorig",
        label: "Grundläggande högskolebehörighet",
        short: "Högsk.behöriga",
        unit: "percent",
        higherIsBetter: true,
      },
      ...staffMetrics,
    ],
  },
  {
    code: "GYS",
    label: "Anpassad gymnasieskola",
    short: "Anpassad gy.",
    gradeFilter: [],
    headline: ["behoriga", "elevPerLarare"],
    metrics: [...staffMetrics],
  },
  {
    code: "VUX",
    label: "Komvux",
    short: "Komvux",
    gradeFilter: [],
    headline: ["behoriga", "elevPerLarare"],
    metrics: [...staffMetrics],
  },
  {
    code: "FTH",
    label: "Fritidshem",
    short: "Fritidshem",
    gradeFilter: [],
    headline: [],
    metrics: [...staffMetrics],
  },
];

const byCode = new Map(skolformer.map((f) => [f.code, f]));

export function skolform(code: SkolformCode): SkolformDef | undefined {
  return byCode.get(code);
}

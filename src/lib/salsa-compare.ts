import { salsametriker, type SalsaMetrik } from "@/config/salsametriker";
import { DASH, dec, signed } from "./format";
import { direction, positionPct, type Direction } from "./compare";
import type { Salsa } from "./skolregister";

/** `compare.ts`'s `omdöme` is phrased for a riket comparison — SALSA compares against a modeled expectation instead. */
function salsaOmdöme(dir: Direction): string {
  return dir === "over"
    ? "Över förväntat resultat"
    : dir === "under"
      ? "Under förväntat resultat"
      : dir === "level"
        ? "I nivå med förväntat resultat"
        : "Utan riktning";
}

/**
 * One SALSA measure, mirroring `NyckeltalJämförelse`'s shape where it fits —
 * `value`/`omdöme`/`riktning` behave the same way — but with no
 * kommun/riksgenomsnitt: SALSA's `Deviation` already *is* the comparison
 * (against a modeled expectation, not against other schools), so there is
 * nothing else to subtract against.
 */
export interface SalsaJämförelse {
  key: string;
  metrik: SalsaMetrik;
  label: string;
  läsår: string;
  /** The deviation, formatted with a sign. */
  value: string;
  tal: number | null;
  /** The supporting "actual" figure, e.g. "257 meritvärdespoäng". */
  faktisk: string;
  faktiskTal: number | null;
  riktning: Direction;
  omdöme: string;
  /** Position of `tal` on `metrik.domain`, centered at 0. `null` when missing. */
  egenPct: number | null;
  skala: string;
  förklaring: string;
}

function skalaText(metrik: SalsaMetrik): string {
  const [min, max] = metrik.domain;
  return `${signed(min)}–${signed(max)}`;
}

export function buildSalsaComparisons(salsa: Salsa | null): SalsaJämförelse[] {
  if (!salsa) return [];
  const läsår = salsa.period ?? DASH;

  return salsametriker.map((metrik) => {
    const deviation = salsa.matt[metrik.deviationKey];
    const actual = salsa.matt[metrik.actualKey];
    const tal = deviation?.typ === "EXISTS" ? deviation.tal : null;
    const faktiskTal = actual?.typ === "EXISTS" ? actual.tal : null;
    const dir = direction(tal, metrik.higherIsBetter);

    return {
      key: metrik.deviationKey,
      metrik,
      label: metrik.label,
      läsår,
      value: tal != null ? signed(tal) : DASH,
      tal,
      faktisk: faktiskTal != null ? `${dec(faktiskTal)} ${metrik.enhet}` : DASH,
      faktiskTal,
      riktning: dir,
      omdöme: salsaOmdöme(dir),
      egenPct: tal != null ? positionPct(tal, metrik.domain) : null,
      skala: skalaText(metrik),
      förklaring: metrik.förklaring,
    };
  });
}

import { nyckeltalmetriker, type NyckeltalMetrik } from "@/config/nyckeltalmetriker";
import { DASH, dec } from "./format";
import { direction, omdöme, positionPct, round2, type Direction } from "./compare";
import type { KommunNyckeltalStat, Nyckeltal, NyckeltalVärde } from "./skolregister";

/**
 * One comparison per nyckeltal: the unit's own figure, the kommunsnitt and the
 * riksgenomsnitt reduced to a single readable line, plus everything needed to
 * draw it and to say where it came from.
 *
 * The table this replaces printed each metric three times — its own row, then
 * an indented "Riksgenomsnitt", then an indented "Kommunsnitt" — and left the
 * subtraction, the ranking and the question of what the number even measures
 * to the reader. All three are answered here, once, from the numbers rather
 * than from the strings: `value` is the register's own Swedish text ("cirka
 * 360"), and parsing that back would quietly turn a rounded figure into an
 * exact one.
 */

/** What the page found for one metric's riksgenomsnitt, and where. */
export interface RiksNyckeltal {
  tal: number | null;
  /**
   * Skolverket publishes no national figure for this skolform/metric pair and
   * we averaged one from every unit's own reported value. Shown as a caveat
   * rather than hidden — a computed average is not the official one.
   */
  beräknat: boolean;
  /** The skolform being compared against, written out, e.g. "grundskola". */
  skolform: string | null;
}

export interface KällaRad {
  k: string;
  v: string;
}

export interface NyckeltalJämförelse {
  key: keyof Nyckeltal;
  metrik: NyckeltalMetrik;
  label: string;
  läsår: string;
  /** The register's own text for this unit's figure, with the metric's suffix. */
  value: string;
  tal: number | null;
  /** The register's reason for having no figure; `null` when it has one. */
  saknas: string | null;
  kommun: string;
  kommunTal: number | null;
  riks: string;
  riksTal: number | null;
  beräknatRiks: boolean;
  /** The unit's own figure less riket; `null` when either side is missing. */
  diffRiks: number | null;
  /** The unit's own figure less the kommunsnitt. */
  diffKommun: number | null;
  riktning: Direction;
  omdöme: string;
  /** Positions along `metrik.domain`, in percent. `null` when the figure is missing. */
  egenPct: number | null;
  kommunPct: number | null;
  riksPct: number | null;
  /** The domain's ends, formatted — printed under the band so the scale is stated. */
  skala: string;
  /** "6 av 84", or a dash when the unit is not ranked. */
  placering: string;
  /** Where the unit sits in that ranking, best at 0%. `null` when unranked. */
  rankPct: number | null;
  /** Provenance, shown behind the "Varifrån kommer talet?" disclosure. */
  källa: KällaRad[];
  förklaring: string;
  /** "högre är bättre" / "lägre brukar tolkas som bättre". */
  riktningsText: string;
}

const RIKTNINGSTEXT = {
  hög: "högre är bättre",
  låg: "lägre brukar tolkas som bättre",
} as const;

function talText(tal: number | null, metrik: NyckeltalMetrik): string {
  return tal == null ? DASH : `${dec(tal)}${metrik.suffix}`;
}

/** The domain's ends without their trailing ",0" — a scale, not a measurement. */
function skalaText(metrik: NyckeltalMetrik): string {
  const [min, max] = metrik.domain;
  return `${min}–${max}${metrik.suffix}`;
}

function källrader(
  metrik: NyckeltalMetrik,
  v: NyckeltalVärde,
  stat: KommunNyckeltalStat | undefined,
  riks: RiksNyckeltal | undefined,
): KällaRad[] {
  const rader: KällaRad[] = [{ k: "Mått", v: metrik.mått }];
  if (v.läsår) rader.push({ k: "Läsår", v: v.läsår });
  rader.push({
    k: "Källa",
    v: riks?.skolform
      ? `Skolverkets statistik-API (${riks.skolform})`
      : "Skolverkets statistik-API",
  });
  if (riks?.tal != null) {
    rader.push({
      k: "Riksgenomsnitt",
      v: riks.beräknat
        ? "beräknat av oss ur enheternas egna tal"
        : "Skolverkets officiella tal",
    });
  }
  if (stat && stat.antalMedVärde > 0) {
    rader.push({
      k: "Kommunsnitt",
      v: `${stat.antalMedVärde} enheter i kommunen redovisar talet`,
    });
  }
  return rader;
}

export function buildNyckeltalComparisons(
  nyckeltal: Nyckeltal,
  kommunStats: KommunNyckeltalStat[],
  riksPerKey: Partial<Record<keyof Nyckeltal, RiksNyckeltal>>,
): NyckeltalJämförelse[] {
  const statsByKey = new Map(kommunStats.map((s) => [s.key, s]));

  return nyckeltalmetriker.map((metrik) => {
    const v = nyckeltal[metrik.key];
    const stat = statsByKey.get(metrik.key);
    const riks = riksPerKey[metrik.key];

    const tal = v.status === "finns" ? v.tal : null;
    const kommunTal = stat?.genomsnitt ?? null;
    const riksTal = riks?.tal ?? null;
    const diffRiks = tal != null && riksTal != null ? tal - riksTal : null;
    const diffKommun = tal != null && kommunTal != null ? tal - kommunTal : null;
    const dir = direction(diffRiks, metrik.higherIsBetter);

    return {
      key: metrik.key,
      metrik,
      label: metrik.label,
      läsår: v.läsår ?? DASH,
      value: v.status === "finns" ? `${v.text}${metrik.suffix}` : DASH,
      tal,
      saknas: v.status === "finns" ? null : v.förklaring,
      kommun: talText(kommunTal, metrik),
      kommunTal,
      riks: talText(riksTal, metrik),
      riksTal,
      beräknatRiks: riks?.beräknat ?? false,
      diffRiks,
      diffKommun,
      riktning: dir,
      omdöme: omdöme(dir),
      egenPct: tal != null ? positionPct(tal, metrik.domain) : null,
      kommunPct: kommunTal != null ? positionPct(kommunTal, metrik.domain) : null,
      riksPct: riksTal != null ? positionPct(riksTal, metrik.domain) : null,
      skala: skalaText(metrik),
      placering: stat?.rank != null ? `${stat.rank} av ${stat.antalRankade}` : DASH,
      // A single ranked unit has nowhere to sit on the track, so it gets no
      // marker rather than a division by zero.
      rankPct:
        stat?.rank != null && stat.antalRankade > 1
          ? round2(((stat.rank - 1) / (stat.antalRankade - 1)) * 100)
          : null,
      källa: källrader(metrik, v, stat, riks),
      förklaring:
        metrik.förklaring +
        (riks?.beräknat
          ? " Skolverket publicerar inget officiellt rikstal för den här " +
            "kombinationen av skolform och mått, så snittet är räknat av oss " +
            "ur varje enhets egna redovisade tal."
          : ""),
      riktningsText: metrik.higherIsBetter ? RIKTNINGSTEXT.hög : RIKTNINGSTEXT.låg,
    };
  });
}

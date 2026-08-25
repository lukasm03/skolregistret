import { DASH, dec, num } from "./format";
import { direction, positionPct, type Direction } from "./compare";
import {
  enkätGruppKey,
  type Elevenkät,
  type EnkätGrupp,
  type Enkätfråga,
  type Skolenkät,
  type Vårdnadshavarenkät,
} from "./skolregister";

/**
 * The skolenkät as one card per reporting group, with kommunen and riket
 * folded into each answer rather than repeated as two muted rows beneath it.
 *
 * Everything a group is compared against is the average of the *same* group
 * elsewhere — åk 5 against åk 5, vårdnadshavare against vårdnadshavare. A
 * straight average across årskurser would not mean anything, which is why
 * `enkätGruppKey` exists and why this module never mixes two of them.
 */

/** The five questions the page shows, in order. */
const FRÅGOR = ["nöjdhet", "trygghet", "studiero", "stöd", "stimulans"] as const;

export const ENKÄT_DIMENSIONER = [
  "Nöjdhet",
  "Trygghet",
  "Studiero",
  "Stöd",
  "Stimulans",
] as const;

/** Skolinspektionen reports every answer on this scale, so the band can be fixed. */
const SKALA: [number, number] = [0, 10];

/**
 * Below this share of the group answered, single questions start moving on a
 * handful of responses. Skolinspektionen publishes the figures either way; we
 * publish them with a caveat rather than hiding them.
 */
const LÅG_SVARSFREKVENS = 70;
/** Same idea where no svarsfrekvens is reported at all — vårdnadshavarenkäten. */
const LITET_UNDERLAG = 30;

export interface EnkätDimension {
  label: string;
  /** The group's own average, formatted; DASH when the question went unanswered. */
  value: string;
  tal: number | null;
  kommun: string;
  riks: string;
  /** The group's average less riket's for the same group. */
  diff: number | null;
  riktning: Direction;
  egenPct: number | null;
  kommunPct: number | null;
  riksPct: number | null;
}

export interface EnkätJämförelse {
  key: string;
  /** "Elever · Grundskola åk 5", "Vårdnadshavare · Förskoleklass". */
  grupp: string;
  läsår: string;
  antalSvar: string;
  /** "88%" when the register reports a response rate for the group, else null. */
  svarsfrekvens: string | null;
  tillförlitlighet: string;
  /** Whether that judgement is a caveat or a clean bill. */
  osäkert: boolean;
  dimensioner: EnkätDimension[];
}

/**
 * The register spells årskurser as `ak5`, `ak8`, `ar2` — grundskolans years
 * and gymnasiets year 2 in the same field, distinguished only by the prefix.
 * Rendering the code raw gave "åk ak5".
 */
export function årskursText(kod: string | null): string {
  if (!kod) return "";
  const m = /^a([kr])(\d+)$/.exec(kod);
  if (!m) return ` ${kod}`;
  return m[1] === "k" ? ` åk ${m[2]}` : ` år ${m[2]}`;
}

function frågeTal(f: Enkätfråga | null | undefined): number | null {
  return f?.genomsnitt ?? null;
}

function dimensioner(
  e: Vårdnadshavarenkät | Elevenkät,
  kommun: EnkätGrupp | undefined,
  riks: EnkätGrupp | undefined,
): EnkätDimension[] {
  return FRÅGOR.map((fråga, i) => {
    const tal = frågeTal(e[fråga]);
    const kommunTal = kommun?.genomsnitt[fråga] ?? null;
    const riksTal = riks?.genomsnitt[fråga] ?? null;
    const diff = tal != null && riksTal != null ? tal - riksTal : null;
    return {
      label: ENKÄT_DIMENSIONER[i],
      value: tal != null ? dec(tal) : DASH,
      tal,
      kommun: kommunTal != null ? dec(kommunTal) : DASH,
      riks: riksTal != null ? dec(riksTal) : DASH,
      diff,
      // Every enkätfråga is phrased so that a higher average is the better
      // answer — trygghet, studiero, stöd and stimulans alike.
      riktning: direction(diff, true),
      egenPct: tal != null ? positionPct(tal, SKALA) : null,
      kommunPct: kommunTal != null ? positionPct(kommunTal, SKALA) : null,
      riksPct: riksTal != null ? positionPct(riksTal, SKALA) : null,
    };
  });
}

function tillförlitlighet(
  svarsfrekvens: number | null,
  antalSvar: number | null,
): { text: string; osäkert: boolean } {
  if (svarsfrekvens != null) {
    return svarsfrekvens >= LÅG_SVARSFREKVENS
      ? { text: "Gott underlag", osäkert: false }
      : { text: "Lägre svarsfrekvens", osäkert: true };
  }
  if (antalSvar != null) {
    return antalSvar >= LITET_UNDERLAG
      ? { text: "Gott underlag", osäkert: false }
      : { text: "Litet underlag", osäkert: true };
  }
  return { text: "Okänt underlag", osäkert: true };
}

function jämförelse(
  key: string,
  grupp: string,
  e: Vårdnadshavarenkät | Elevenkät,
  svarsfrekvens: number | null,
  kommun: EnkätGrupp | undefined,
  riks: EnkätGrupp | undefined,
): EnkätJämförelse {
  const dims = dimensioner(e, kommun, riks);
  const { text, osäkert } = tillförlitlighet(svarsfrekvens, e.antalSvar);
  return {
    key,
    grupp,
    läsår: e.läsår ?? DASH,
    antalSvar: e.antalSvar != null ? num(e.antalSvar) : DASH,
    svarsfrekvens: svarsfrekvens != null ? `${svarsfrekvens}%` : null,
    tillförlitlighet: text,
    osäkert,
    dimensioner: dims,
  };
}

/**
 * Elevernas grupper first — they answered about their own school — then
 * vårdnadshavarnas, each in the order the register lists them.
 */
export function buildEnkätComparisons(
  enkät: Skolenkät,
  kommunGrupper: Map<string, EnkätGrupp>,
  riksGrupper: Map<string, EnkätGrupp>,
): EnkätJämförelse[] {
  const elever = enkät.elever.map((e, i) => {
    const nyckel = enkätGruppKey(e.skolform, e.årskurs);
    return jämförelse(
      `e-${i}`,
      `Elever · ${e.skolform}${årskursText(e.årskurs)}`,
      e,
      e.svarsfrekvens,
      kommunGrupper.get(nyckel),
      riksGrupper.get(nyckel),
    );
  });
  const vårdnadshavare = enkät.vårdnadshavare.map((v, i) => {
    const nyckel = enkätGruppKey(v.skolform);
    return jämförelse(
      `v-${i}`,
      `Vårdnadshavare · ${v.skolform}`,
      v,
      // The vårdnadshavarenkät reports no group size, so no share can be
      // computed from it — the pill falls back to the count of answers.
      null,
      kommunGrupper.get(nyckel),
      riksGrupper.get(nyckel),
    );
  });
  return [...elever, ...vårdnadshavare];
}

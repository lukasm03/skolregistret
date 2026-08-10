/**
 * Everything computed *across* register records rather than fetched: kommun
 * averages and rankings, self-computed riksgenomsnitt, and skolenkät averages.
 *
 * The register publishes no bulk endpoint for any of these, so each one scans
 * many per-unit records. The expensive ones (`getBeräknatRiksGenomsnitt`,
 * `getRiksEnkätGenomsnitt`) memoize per process, since recomputing them on
 * every detail page would make all of them slow.
 */

import { readRegisterFile } from "./client";
import { getSkola, getSkolenkät, listSkolor } from "./resources";
import { GRUNDSKOLA_NYCKELTAL, primärStatistikskolform } from "./skolform";
import {
  ENKÄT_FRÅGOR,
  type BeräknatRiksGenomsnitt,
  type Elevenkät,
  type EnkätFrågaKey,
  type EnkätGenomsnittPerFråga,
  type EnkätGrupp,
  type KommunNyckeltalStat,
  type Nyckeltal,
  type NyckeltalVärde,
  type ProgramNyckeltalKey,
  type SkolaDetalj,
  type Skolenkät,
  type Skolform,
  type Vårdnadshavarenkät,
} from "./types";

/** Direction that counts as "better" for each nyckeltal, used for ranking. */
const NYCKELTAL_BÄTTRE_RIKTNING: Record<keyof Nyckeltal, "hög" | "låg"> = {
  meritvärdeÅrskurs9: "hög",
  andelGodkändaÅrskurs9: "hög",
  andelBehörigaLärare: "hög",
  eleverPerLärare: "låg",
};

/**
 * Kommun average and this unit's ranking for each nyckeltal, computed across
 * every other unit in the same kommun. The register has no bulk nyckeltal
 * endpoint, so this fetches every kommun-mate's detail record — each one
 * cached by `getSkola`'s revalidate window, so repeat calls for the same
 * kommun (e.g. across its units' detail pages) stay cheap.
 */
export async function getKommunNyckeltalStats(
  kommunkod: string,
  skolenhetskod: string,
): Promise<KommunNyckeltalStat[]> {
  const skolor = await listSkolor();
  const kommunSkolor = skolor.filter((s) => s.kommunkod === kommunkod);
  const detaljer = await Promise.all(kommunSkolor.map((s) => getSkola(s.skolenhetskod)));

  const keys = Object.keys(NYCKELTAL_BÄTTRE_RIKTNING) as (keyof Nyckeltal)[];
  return keys.map((key) => {
    const värden = detaljer
      .filter((d): d is SkolaDetalj => d != null)
      .map((d) => ({ kod: d.skolenhetskod, v: d.nyckeltal[key] }))
      .filter(
        (x): x is { kod: string; v: Extract<NyckeltalVärde, { status: "finns" }> } =>
          x.v.status === "finns",
      );

    const genomsnitt = värden.length
      ? värden.reduce((sum, x) => sum + x.v.tal, 0) / värden.length
      : null;

    const riktning = NYCKELTAL_BÄTTRE_RIKTNING[key];
    const rankade = [...värden].sort((a, b) =>
      riktning === "låg" ? a.v.tal - b.v.tal : b.v.tal - a.v.tal,
    );
    const index = rankade.findIndex((x) => x.kod === skolenhetskod);

    return {
      key,
      genomsnitt,
      antalMedVärde: värden.length,
      rank: index === -1 ? null : index + 1,
      antalRankade: rankade.length,
    };
  });
}

let beräknatRiksGenomsnittCache: Promise<BeräknatRiksGenomsnitt> | null = null;

/**
 * Averages every unit's own reported nyckeltal into a nationwide figure, for
 * use wherever `getNationelltGenomsnitt`/`getNationelltProgramGenomsnitt`
 * comes back "saknas" for that particular metric — Skolverket's own
 * national-average endpoint doesn't always cover every metric it publishes
 * per unit. Computed once per process across every unit in the register
 * (thousands of skoldetalj fetches, cached individually by `getSkola`) since
 * redoing that scan on every skoldetalj page would make them all slow —
 * the same tradeoff `getRiksEnkätGenomsnitt` makes for the skolenkät.
 */
export async function getBeräknatRiksGenomsnitt(): Promise<BeräknatRiksGenomsnitt> {
  if (!beräknatRiksGenomsnittCache) {
    beräknatRiksGenomsnittCache = (async () => {
      const skolor = await listSkolor();
      const detaljer = await Promise.all(skolor.map((s) => getSkola(s.skolenhetskod)));

      const nyckeltalSummor = new Map<
        Skolform,
        {
          sum: Partial<Record<keyof Nyckeltal, number>>;
          n: Partial<Record<keyof Nyckeltal, number>>;
        }
      >();
      const addNyckeltal = (skolform: Skolform, key: keyof Nyckeltal, tal: number) => {
        let bucket = nyckeltalSummor.get(skolform);
        if (!bucket) {
          bucket = { sum: {}, n: {} };
          nyckeltalSummor.set(skolform, bucket);
        }
        bucket.sum[key] = (bucket.sum[key] ?? 0) + tal;
        bucket.n[key] = (bucket.n[key] ?? 0) + 1;
      };

      const programSummor = new Map<
        string,
        {
          sum: Partial<Record<ProgramNyckeltalKey, number>>;
          n: Partial<Record<ProgramNyckeltalKey, number>>;
        }
      >();
      const addProgram = (kod: string, key: ProgramNyckeltalKey, tal: number) => {
        let bucket = programSummor.get(kod);
        if (!bucket) {
          bucket = { sum: {}, n: {} };
          programSummor.set(kod, bucket);
        }
        bucket.sum[key] = (bucket.sum[key] ?? 0) + tal;
        bucket.n[key] = (bucket.n[key] ?? 0) + 1;
      };

      const ÖVRIGA_NYCKELTAL = ["andelBehörigaLärare", "eleverPerLärare"] as const;
      const PROGRAM_NYCKELTAL_KEYS = [
        "lägstaAntagningspoäng",
        "genomsnittligAntagningspoäng",
        "andelMedExamenInom3År",
        "betygspoängMedExamen",
        "andelMedHögskolebehörighet",
      ] as const;

      for (const d of detaljer) {
        if (!d) continue;

        for (const key of GRUNDSKOLA_NYCKELTAL) {
          const v = d.nyckeltal[key];
          if (v.status === "finns") addNyckeltal("gr", key, v.tal);
        }

        const skolform = primärStatistikskolform(d.skolformer);
        if (skolform) {
          for (const key of ÖVRIGA_NYCKELTAL) {
            const v = d.nyckeltal[key];
            if (v.status === "finns") addNyckeltal(skolform, key, v.tal);
          }
        }

        for (const p of d.program) {
          if (p.antalElever.status === "finns")
            addProgram(p.kod, "antalElever", p.antalElever.tal);
          for (const key of PROGRAM_NYCKELTAL_KEYS) {
            const v = p.nyckeltal[key];
            if (v.status === "finns") addProgram(p.kod, key, v.tal);
          }
        }
      }

      const medelvärde = <K extends string>(
        summor: Map<
          string,
          { sum: Partial<Record<K, number>>; n: Partial<Record<K, number>> }
        >,
      ): Map<string, Partial<Record<K, number>>> => {
        const result = new Map<string, Partial<Record<K, number>>>();
        for (const [nyckel, bucket] of summor) {
          const avg: Partial<Record<K, number>> = {};
          for (const key of Object.keys(bucket.sum) as K[]) {
            avg[key] = bucket.sum[key]! / bucket.n[key]!;
          }
          result.set(nyckel, avg);
        }
        return result;
      };

      return {
        perSkolform: medelvärde(nyckeltalSummor) as Map<
          Skolform,
          Partial<Record<keyof Nyckeltal, number>>
        >,
        perProgram: medelvärde(programSummor),
      };
    })();
  }
  return beräknatRiksGenomsnittCache;
}

/** The register has no separate elevenkät/vårdnadshavarenkät identity beyond skolform + årskurs. */
export function enkätGruppKey(skolform: string, årskurs?: string | null): string {
  return årskurs != null ? `elev:${skolform}:${årskurs}` : `vårdnadshavare:${skolform}`;
}

/**
 * Averages every `Skolenkät`'s vårdnadshavar- and elevenkät entries into one
 * `EnkätGrupp` per (skolform, årskurs), the same grouping `enkätGruppKey`
 * looks results up by. Missing questions (`genomsnitt: null`) are excluded
 * from that question's average rather than treated as zero.
 */
function averageEnkäter(enkäter: Skolenkät[]): Map<string, EnkätGrupp> {
  const sums = new Map<
    string,
    {
      sum: Record<EnkätFrågaKey, number>;
      n: Record<EnkätFrågaKey, number>;
      antalSvarSum: number;
      antalSvarN: number;
      läsårRäknat: Map<string, number>;
      antalSkolor: number;
    }
  >();
  const zero = () =>
    Object.fromEntries(ENKÄT_FRÅGOR.map((k) => [k, 0])) as Record<EnkätFrågaKey, number>;

  const addEntry = (gruppKey: string, e: Vårdnadshavarenkät | Elevenkät) => {
    let bucket = sums.get(gruppKey);
    if (!bucket) {
      bucket = {
        sum: zero(),
        n: zero(),
        antalSvarSum: 0,
        antalSvarN: 0,
        läsårRäknat: new Map(),
        antalSkolor: 0,
      };
      sums.set(gruppKey, bucket);
    }
    bucket.antalSkolor += 1;
    for (const key of ENKÄT_FRÅGOR) {
      const värde = e[key]?.genomsnitt;
      if (värde != null) {
        bucket.sum[key] += värde;
        bucket.n[key] += 1;
      }
    }
    if (e.antalSvar != null) {
      bucket.antalSvarSum += e.antalSvar;
      bucket.antalSvarN += 1;
    }
    if (e.läsår != null) {
      bucket.läsårRäknat.set(e.läsår, (bucket.läsårRäknat.get(e.läsår) ?? 0) + 1);
    }
  };

  for (const enkät of enkäter) {
    for (const v of enkät.vårdnadshavare) addEntry(enkätGruppKey(v.skolform), v);
    for (const e of enkät.elever) addEntry(enkätGruppKey(e.skolform, e.årskurs), e);
  }

  const result = new Map<string, EnkätGrupp>();
  for (const [gruppKey, bucket] of sums) {
    const genomsnitt = Object.fromEntries(
      ENKÄT_FRÅGOR.map((k) => [k, bucket.n[k] > 0 ? bucket.sum[k] / bucket.n[k] : null]),
    ) as EnkätGenomsnittPerFråga;
    let läsår: string | null = null;
    let bästAntal = 0;
    for (const [år, antal] of bucket.läsårRäknat) {
      if (antal > bästAntal || (antal === bästAntal && (läsår == null || år > läsår))) {
        läsår = år;
        bästAntal = antal;
      }
    }
    result.set(gruppKey, {
      genomsnitt,
      antalSvar: bucket.antalSvarN > 0 ? bucket.antalSvarSum / bucket.antalSvarN : null,
      läsår,
      antalSkolor: bucket.antalSkolor,
    });
  }
  return result;
}

/**
 * Kommunsnitt for the skolenkät, computed across every unit in the kommun
 * (including this one, matching `getKommunNyckeltalStats`) since the
 * register has no bulk enkät endpoint to read a real average from. Grouped
 * by `enkätGruppKey` — a straight average across skolformer or årskurser
 * wouldn't mean anything.
 */
export async function getKommunEnkätGenomsnitt(
  kommunkod: string,
): Promise<Map<string, EnkätGrupp>> {
  const skolor = await listSkolor();
  const kommunSkolor = skolor.filter((s) => s.kommunkod === kommunkod);
  const enkäter = await Promise.all(
    kommunSkolor.map((s) => getSkolenkät(s.skolenhetskod)),
  );
  return averageEnkäter(enkäter);
}

let riksEnkätCache: Promise<Map<string, EnkätGrupp>> | null = null;

/**
 * Riksgenomsnitt for the skolenkät, computed once per process across every
 * unit in the register — there's no Skolverket/Skolinspektionen endpoint for
 * this the way `getNationelltGenomsnitt` has for nyckeltal. In file mode
 * this reads the already in-memory `skolenkäterOchDokument` export; in live
 * mode it fetches every unit's enkät once and keeps the computed averages
 * for the rest of the process, since re-fetching ~5000+ units per request
 * would make every skoldetalj page slow.
 */
export async function getRiksEnkätGenomsnitt(): Promise<Map<string, EnkätGrupp>> {
  if (!riksEnkätCache) {
    riksEnkätCache = (async () => {
      const path = process.env.SKOLREGISTER_DATA_FILE;
      if (path) {
        const { skolenkäterOchDokument } = await readRegisterFile(path);
        return averageEnkäter((skolenkäterOchDokument ?? []).map((e) => e.enkät));
      }
      const skolor = await listSkolor();
      const enkäter = await Promise.all(skolor.map((s) => getSkolenkät(s.skolenhetskod)));
      return averageEnkäter(enkäter);
    })();
  }
  return riksEnkätCache;
}

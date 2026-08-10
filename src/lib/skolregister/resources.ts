/**
 * One function per skolregister endpoint. Each one checks
 * `SKOLREGISTER_DATA_FILE` first and serves from the local export when it is
 * set, falling back to HTTP otherwise — see `.env.example`.
 *
 * Anything that aggregates *across* these results (kommun averages,
 * riksgenomsnitt, enkätsnitt) belongs in `statistics.ts`, not here.
 */

import { fetchAllPages, fetchJson, fetchJsonOr404, readRegisterFile } from "./client";
import type {
  HuvudmanRad,
  NationelltGenomsnitt,
  NationelltGenomsnittSkolform,
  NationelltProgramGenomsnitt,
  NyckeltalVärde,
  SkolaDetalj,
  Skolenkät,
  Skolform,
  SkolinspektionDokumentgrupp,
  SkolorRad,
} from "./types";

export async function listSkolor(): Promise<SkolorRad[]> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) return (await readRegisterFile(path)).skolor;
  return fetchAllPages<SkolorRad>("/api/skolor");
}

export async function listHuvudman(): Promise<HuvudmanRad[]> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) return (await readRegisterFile(path)).huvudmän;
  return fetchAllPages<HuvudmanRad>("/api/huvudman");
}

/**
 * The register export's own build date (`RegisterFile.byggd`) — `null` in
 * live-API mode (no `SKOLREGISTER_DATA_FILE`), which has no such field.
 */
export async function getRegisterByggd(): Promise<string | null> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (!path) return null;
  return (await readRegisterFile(path)).byggd;
}

/** `saknas`-värde for a nyckeltal the register file simply doesn't carry. */
const INGEN_FILDATA: NyckeltalVärde = {
  status: "saknas",
  förklaring: "Ingen uppgift i registerfilen",
  läsår: null,
};

/**
 * `getSkola` when `SKOLREGISTER_DATA_FILE` is set: newer exports carry a
 * `skoldetaljer` array with the same per-unit detail (rektor, kontakt,
 * program, nyckeltal) `byggSkoldetalj` would return live. Older exports
 * without that field fall back to `SkolorRad`-level data with the detail
 * fields empty/`saknas`, rather than reaching out to the live API — which
 * isn't guaranteed to be running alongside a file-based build.
 */
async function getSkolaFromFile(path: string, kod: string): Promise<SkolaDetalj | null> {
  const { skolor, skoldetaljer } = await readRegisterFile(path);
  const detalj = skoldetaljer?.find((s) => s.skolenhetskod === kod);
  if (detalj) return detalj;

  const rad = skolor.find((s) => s.skolenhetskod === kod);
  if (!rad) return null;
  return {
    ...rad,
    rektor: null,
    startdatum: null,
    besöksadress: null,
    telefon: null,
    webbplats: null,
    epost: null,
    koordinater: null,
    program: [],
    nyckeltal: {
      meritvärdeÅrskurs9: INGEN_FILDATA,
      andelGodkändaÅrskurs9: INGEN_FILDATA,
      andelBehörigaLärare: INGEN_FILDATA,
      eleverPerLärare: INGEN_FILDATA,
    },
  };
}

export function getSkola(kod: string): Promise<SkolaDetalj | null> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) return getSkolaFromFile(path, kod);
  return fetchJsonOr404<SkolaDetalj>(`/api/skolor/${encodeURIComponent(kod)}`);
}

/**
 * `GET /api/nationellt-genomsnitt/:skolform` — `null` if Skolverket has no
 * statistics for it. In file mode this reads the export's `nationelltGenomsnitt`
 * array (absent in older exports, in which case this resolves to `null` too).
 */
export async function getNationelltGenomsnitt(
  skolform: NationelltGenomsnittSkolform,
): Promise<NationelltGenomsnitt | null> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) {
    const { nationelltGenomsnitt } = await readRegisterFile(path);
    return nationelltGenomsnitt?.find((g) => g.skolform === skolform) ?? null;
  }
  return fetchJsonOr404<NationelltGenomsnitt>(`/api/nationellt-genomsnitt/${skolform}`);
}

/**
 * `GET /api/nationellt-genomsnitt/gy/:programCode` — `null` if Skolverket
 * has no statistics for that program. In file mode this reads the export's
 * `nationelltProgramGenomsnitt` array (absent in older exports, in which
 * case this resolves to `null` too).
 */
export async function getNationelltProgramGenomsnitt(
  programkod: string,
): Promise<NationelltProgramGenomsnitt | null> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) {
    const { nationelltProgramGenomsnitt } = await readRegisterFile(path);
    return nationelltProgramGenomsnitt?.find((g) => g.programkod === programkod) ?? null;
  }
  return fetchJsonOr404<NationelltProgramGenomsnitt>(
    `/api/nationellt-genomsnitt/gy/${encodeURIComponent(programkod)}`,
  );
}

/**
 * `GET /api/skolor/:skolenhetskod/enkat` — Skolinspektionens skolenkät for
 * the unit. Units with no respondents come back with empty `vårdnadshavare`/
 * `elever` arrays rather than a 404.
 */
export async function getSkolenkät(kod: string): Promise<Skolenkät> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) {
    const { skolenkäterOchDokument } = await readRegisterFile(path);
    const entry = skolenkäterOchDokument?.find((e) => e.skolenhetskod === kod);
    return entry?.enkät ?? { skolenhetskod: kod, vårdnadshavare: [], elever: [] };
  }
  return fetchJson<Skolenkät>(`/api/skolor/${encodeURIComponent(kod)}/enkat`);
}

/**
 * `GET /api/skolor/:skolenhetskod/dokument`, optionally filtered by
 * `skolform`. The export bundles the unfiltered (all-skolformer) list per
 * unit, so file mode doesn't support the `skolform` filter — the UI never
 * passes one.
 */
export async function getSkolinspektionDokument(
  kod: string,
  skolform?: Skolform,
): Promise<SkolinspektionDokumentgrupp[]> {
  const path = process.env.SKOLREGISTER_DATA_FILE;
  if (path) {
    const { skolenkäterOchDokument } = await readRegisterFile(path);
    const entry = skolenkäterOchDokument?.find((e) => e.skolenhetskod === kod);
    return entry?.dokument ?? [];
  }
  const query = skolform ? `?skolform=${encodeURIComponent(skolform)}` : "";
  return fetchJson<SkolinspektionDokumentgrupp[]>(
    `/api/skolor/${encodeURIComponent(kod)}/dokument${query}`,
  );
}

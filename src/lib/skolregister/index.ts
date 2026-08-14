/**
 * Client for the skolregister API. This barrel is the public surface — import
 * from `@/lib/skolregister`, not from the individual modules, so the internal
 * layout can change without touching call sites.
 *
 * The API's own field names (Swedish, `rader`/`totalt` paging) are kept as-is
 * in `types.ts` — nothing outside this directory should assume that shape.
 * `src/lib/api-normalize.ts` translates it into the app's own view models.
 *
 * Every read is served from the register export in `data/` when it exists —
 * `bun run export` builds it — and falls back to HTTP otherwise.
 * `SKOLREGISTER_DATA_FILE` overrides the path; see `.env.example`.
 *
 * Layout:
 * - `types.ts`      the API's shapes, and nothing else
 * - `client.ts`     transport: paging, retry, 404s, reading the export file
 * - `resources.ts`  one function per endpoint
 * - `statistics.ts` figures computed across records (averages, rankings)
 * - `skolform.ts`   which skolform's statistics a nyckeltal compares against
 *
 * Server-only: `client.ts` reads the filesystem. Don't import this from a
 * `"use client"` module — client components receive already-fetched data as
 * props (see `src/components/views/`).
 */

export type * from "./types";
export { ENKÄT_FRÅGOR } from "./types";

export {
  getNationelltGenomsnitt,
  getNationelltProgramGenomsnitt,
  getRegisterByggd,
  getSkola,
  getSkolenkät,
  getSkolinspektionDokument,
  listHuvudman,
  listSkolor,
} from "./resources";

export {
  enkätGruppKey,
  getBeräknatRiksGenomsnitt,
  getKommunEnkätGenomsnitt,
  getKommunNyckeltalStats,
  getRiksEnkätGenomsnitt,
} from "./statistics";

export {
  GRUNDSKOLA_NYCKELTAL,
  SKOLFORM_TILL_STATISTIKNYCKEL,
  primärStatistikskolform,
} from "./skolform";

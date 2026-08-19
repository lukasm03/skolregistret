/**
 * Client for the register data. This barrel is the public surface — import
 * from `@/lib/skolregister`, not from the individual modules, so the internal
 * layout can change without touching call sites.
 *
 * `types.ts` holds two families: `allt.json`'s own raw shapes (used only
 * inside this directory) and this module's stable output contract
 * (`SkolorRad`, `SkolaDetalj`, `HuvudmanRad`, `Nyckeltal`, `Skolenkät`, …) —
 * everything outside this directory consumes only the latter.
 *
 * Every read is served from `data/allt.json` — gitignored, supplied locally,
 * not committed (see AGENTS.md). `SKOLREGISTER_DATA_FILE` overrides the path.
 *
 * Layout:
 * - `types.ts`      both type families described above
 * - `normalize.ts`  pure helpers for reading `allt.json`'s raw shapes
 * - `client.ts`     transport: reading and caching the file
 * - `resources.ts`  one function per resource
 * - `huvudman.ts`   the huvudman aggregate, joined by organisationsnummer
 * - `koncern.ts`     the koncern ownership tree
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
  ancestorPath,
  buildKoncernGroups,
  buildTrädFrånNoder,
  type KoncernGroup,
} from "./koncern";

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
  STATISTIKNYCKEL_NAMN,
  primärStatistikskolform,
} from "./skolform";

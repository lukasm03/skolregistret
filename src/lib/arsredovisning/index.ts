/**
 * Årsredovisningar filed with Bolagsverket, read from `data/arsredovisningar/`
 * — one directory per organisationsnummer, one zip per filed year. Like
 * `allt.json` the packages are supplied locally and never committed
 * (see AGENTS.md); `SKOLREGISTER_ARSREDOVISNING_DIR` overrides the path.
 *
 * Import from `@/lib/arsredovisning`, not from the individual modules.
 *
 * - `format.ts` pure: filenames in, period labels out
 * - `paket.ts`  transport: the directory and the zips inside it
 *
 * Server-only: `paket.ts` reads the filesystem.
 */

export {
  formateraOrgnr,
  parsePaketNamn,
  räkenskapsårEtikett,
  type PaketNamn,
} from "./format";

export {
  harÅrsredovisningskatalog,
  listÅrsredovisningar,
  läsHandling,
  type Handling,
  type Handlingsdel,
  type Årsredovisning,
} from "./paket";

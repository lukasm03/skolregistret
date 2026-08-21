/**
 * Transport for `data/arsredovisningar/`: which packages exist for an
 * organisationsnummer, and what is inside one.
 *
 * A package is Bolagsverkets own zip, holding one or two iXBRL documents:
 * the årsredovisning, whose entry name is the package id, and — when the
 * bolag is audited — the revisionsberättelse under an id of its own. That
 * naming is the only thing separating the two, so it is what we key off:
 * the entry matching the package id is the årsredovisning, the other is the
 * revisionsberättelse.
 *
 * Server-only: reads the filesystem. Don't import from a `"use client"`
 * module. Nothing here computes or renders — labels live in `format.ts`.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { parsePaketNamn, räkenskapsårEtikett } from "./format";

/** What the external collector tool writes, relative to the repo root. */
const STANDARDKATALOG = "data/arsredovisningar";

let katalogCache: string | undefined;

/**
 * The directory to read. `SKOLREGISTER_ARSREDOVISNING_DIR` wins when set —
 * the packages are as uncommittable as `allt.json` and may live anywhere.
 * Resolved once per process, like `registerFilePath()`.
 */
export function årsredovisningKatalog(): string {
  if (katalogCache === undefined) {
    katalogCache = process.env.SKOLREGISTER_ARSREDOVISNING_DIR ?? STANDARDKATALOG;
  }
  return katalogCache;
}

/** Which of a package's two documents a link points at. */
export type Handlingsdel = "arsredovisning" | "revisionsberattelse";

export interface Årsredovisning {
  /** Package id — the route's `[id]`, and the årsredovisning's entry name. */
  id: string;
  /** The räkenskapsår's last day, ISO: "2025-06-30". */
  räkenskapsårSlut: string;
  /** "2025", or "2024/25" for a brutet räkenskapsår. */
  etikett: string;
  storlekBytes: number;
  /** Missing for the bolag that file without an auditor. */
  revisionsberättelseBytes: number | null;
}

interface Poster {
  /** Entry name → uncompressed size, for the package's one or two documents. */
  [namn: string]: number;
}

/**
 * fflate's `filter` is called with each entry's header before anything is
 * inflated, so this reads names and sizes without decompressing the payload.
 */
function läsPoster(zip: Uint8Array): Poster {
  const poster: Poster = {};
  unzipSync(zip, {
    filter: (fil) => {
      poster[fil.name] = fil.originalSize;
      return false;
    },
  });
  return poster;
}

function delarsNamn(poster: Poster, id: string, del: Handlingsdel): string | null {
  const namn = Object.keys(poster).filter((n) => n.toLowerCase().endsWith(".xhtml"));
  const huvud = namn.find((n) => n.toLowerCase().startsWith(id));
  if (del === "arsredovisning") return huvud ?? null;
  return namn.find((n) => n !== huvud) ?? null;
}

const listCache = new Map<string, Promise<Årsredovisning[]>>();

/**
 * Every filed årsredovisning we hold for an organisationsnummer, newest
 * räkenskapsår first. An organisationsnummer with no directory — every
 * kommunal huvudman, and the bolag the collector has not reached — is not an
 * error: it lists as empty.
 */
export function listÅrsredovisningar(orgnr: string): Promise<Årsredovisning[]> {
  const cached = listCache.get(orgnr);
  if (cached) return cached;

  const laddning = (async () => {
    if (!/^\d{10}$/.test(orgnr)) return [];
    const katalog = join(årsredovisningKatalog(), orgnr);

    let filer: string[];
    try {
      filer = await readdir(katalog);
    } catch {
      return [];
    }

    const rader = await Promise.all(
      filer.map(async (filnamn) => {
        const namn = parsePaketNamn(filnamn);
        if (!namn) return null;
        const poster = läsPoster(new Uint8Array(await readFile(join(katalog, filnamn))));
        const huvud = delarsNamn(poster, namn.id, "arsredovisning");
        // A package whose årsredovisning we cannot name is one we cannot
        // link to either — skip it rather than list a dead row.
        if (!huvud) return null;
        const revision = delarsNamn(poster, namn.id, "revisionsberattelse");
        return {
          id: namn.id,
          räkenskapsårSlut: namn.räkenskapsårSlut,
          etikett: räkenskapsårEtikett(namn.räkenskapsårSlut),
          storlekBytes: poster[huvud]!,
          revisionsberättelseBytes: revision ? poster[revision]! : null,
        } satisfies Årsredovisning;
      }),
    );

    return rader
      .filter((r): r is Årsredovisning => r !== null)
      .sort((a, b) => b.räkenskapsårSlut.localeCompare(a.räkenskapsårSlut));
  })();

  listCache.set(orgnr, laddning);
  return laddning;
}

export interface Handling {
  xhtml: string;
  räkenskapsårSlut: string;
}

/**
 * One document out of one package. Returns `null` for anything that does not
 * resolve — an unknown organisationsnummer or package id, a package without
 * a revisionsberättelse — so the route can answer 404 without distinguishing
 * between them.
 */
export async function läsHandling(
  orgnr: string,
  id: string,
  del: Handlingsdel,
): Promise<Handling | null> {
  const paket = (await listÅrsredovisningar(orgnr)).find((p) => p.id === id);
  if (!paket) return null;

  const katalog = join(årsredovisningKatalog(), orgnr);
  const filnamn = `${paket.räkenskapsårSlut}-${paket.id}_paket.zip`;
  const zip = new Uint8Array(await readFile(join(katalog, filnamn)));
  const post = delarsNamn(läsPoster(zip), paket.id, del);
  if (!post) return null;

  const innehåll = unzipSync(zip, { filter: (fil) => fil.name === post })[post];
  if (!innehåll) return null;
  return {
    xhtml: new TextDecoder("utf-8").decode(innehåll),
    räkenskapsårSlut: paket.räkenskapsårSlut,
  };
}

/** Whether the directory exists at all — used to explain an empty list. */
export async function harÅrsredovisningskatalog(): Promise<boolean> {
  try {
    return (await stat(årsredovisningKatalog())).isDirectory();
  } catch {
    return false;
  }
}

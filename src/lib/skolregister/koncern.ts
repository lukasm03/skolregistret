/**
 * The koncern ownership tree: rebuilding `trad.noder` (flat, `djup`-ordered)
 * into a real nested tree, and grouping huvudmän by koncern straight off
 * `karta.koncerner` — the source's own authoritative grouping, not one this
 * app has to infer.
 */

import { readAlltFile, registerFilePath } from "./client";
import { listHuvudman } from "./resources";
import { slugify } from "@/lib/format";
import type {
  Bolagsuppslag,
  HuvudmanKoncern,
  HuvudmanRad,
  Koncerngrupp,
  TradNod,
  TrädNod,
  Valideringsrapport,
} from "./types";

async function alltFile() {
  return readAlltFile(registerFilePath());
}

/**
 * `trad.noder` is flat, ordered by `djup` (0 = koncernmodern). Each node's
 * parent is the closest preceding node one level shallower — the documented
 * algorithm from the source's own reference doc, transcribed directly.
 */
export function buildTrädFrånNoder(
  noder: TradNod[],
  bolag: Record<string, Bolagsuppslag>,
): TrädNod[] {
  const rot: TrädNod[] = [];
  const stack: TrädNod[] = [];
  for (const n of noder) {
    const nod: TrädNod = {
      orgnr: n.orgnr,
      namn: n.namn,
      land: n.land,
      anstallda: n.anstallda,
      bolagsstatus: bolag[n.orgnr]?.status ?? null,
      barn: [],
    };
    stack.length = n.djup;
    (stack[n.djup - 1]?.barn ?? rot).push(nod);
    stack[n.djup] = nod;
  }
  return rot;
}

/** One koncern with every huvudman in the register that belongs to it, straight off `karta.koncerner`. */
export interface KoncernGroup {
  /** URL segment, derived the same way huvudman slugs are. */
  slug: string;
  namn: string;
  orgNr: string;
  /** The koncern's total company count as Dun & Bradstreet reports it — often bigger than `dotterbolag.length`, since most of a koncern's companies are holding companies or run nothing in the school register. */
  antalFöretag: number | null;
  asof: string | null;
  inaktuellt: boolean;
  träd: TrädNod[];
  dotterbolag: HuvudmanRad[];
}

let koncernGroupsCache: Promise<KoncernGroup[]> | null = null;

export function buildKoncernGroups(): Promise<KoncernGroup[]> {
  if (!koncernGroupsCache) {
    koncernGroupsCache = (async () => {
      const [file, huvudman] = await Promise.all([alltFile(), listHuvudman()]);
      const huvudmanByOrgnr = new Map(huvudman.map((h) => [h.organisationsnummer, h]));
      const valideringar = file.validering;

      return (file.karta?.koncerner ?? []).map((grupp: Koncerngrupp) => {
        const validering: Valideringsrapport | undefined =
          valideringar[grupp.koncernmoder.orgnr];
        const namn = grupp.koncernmoder.namn ?? grupp.koncernmoder.orgnr;
        return {
          slug: slugify(namn),
          namn,
          orgNr: grupp.koncernmoder.orgnr,
          antalFöretag: grupp.bolagIKoncernen,
          asof: grupp.asof,
          inaktuellt: validering?.inaktuellt ?? false,
          träd: buildTrädFrånNoder(grupp.trad.noder, file.bolag),
          dotterbolag: grupp.huvudman
            .map((h) => huvudmanByOrgnr.get(h.organizationNumber))
            .filter((h): h is HuvudmanRad => h != null),
        };
      });
    })();
  }
  return koncernGroupsCache;
}

/**
 * The one place a `/koncern/[slug]` URL resolves to its group —
 * `generateMetadata` and the page both resolve through this, so a title can
 * never describe a different koncern than the one rendered. `null` when no
 * group carries the slug, which the route answers with not-found.
 */
export async function getKoncernBySlug(slug: string): Promise<KoncernGroup | null> {
  const groups = await buildKoncernGroups();
  return groups.find((g) => g.slug === slug) ?? null;
}

let koncernForHuvudmanCache: Promise<Map<string, HuvudmanKoncern>> | null = null;

/**
 * Per-huvudman koncern membership, keyed by the huvudman's own
 * organisationsnummer — used by `huvudman.ts` to attach `HuvudmanRad.koncern`
 * and by `/huvudman/[slug]` for the ancestor-chain view.
 */
export function koncernForHuvudmanIndex(): Promise<Map<string, HuvudmanKoncern>> {
  if (!koncernForHuvudmanCache) {
    koncernForHuvudmanCache = (async () => {
      const file = await alltFile();
      const index = new Map<string, HuvudmanKoncern>();
      for (const grupp of file.karta?.koncerner ?? []) {
        const namn = grupp.koncernmoder.namn ?? grupp.koncernmoder.orgnr;
        const validering = file.validering[grupp.koncernmoder.orgnr];
        const träd = buildTrädFrånNoder(grupp.trad.noder, file.bolag);
        const koncern: HuvudmanKoncern = {
          koncernOrgNr: grupp.koncernmoder.orgnr,
          koncernNamn: namn,
          antalFöretag: grupp.bolagIKoncernen,
          asof: grupp.asof,
          inaktuellt: validering?.inaktuellt ?? false,
          träd,
        };
        for (const h of grupp.huvudman) index.set(h.organizationNumber, koncern);
      }
      return index;
    })();
  }
  return koncernForHuvudmanCache;
}

/**
 * Just the path from the koncernmoder down to one huvudman — the closest
 * equivalent of the old flat `kedja: string[]`, for `/huvudman/[slug]`'s
 * "Koncernstruktur" section (the full branching tree stays on `/koncern`).
 */
export function ancestorPath(träd: TrädNod[], orgnr: string): TrädNod[] | null {
  for (const nod of träd) {
    if (nod.orgnr === orgnr) return [nod];
    const under = ancestorPath(nod.barn, orgnr);
    if (under) return [nod, ...under];
  }
  return null;
}

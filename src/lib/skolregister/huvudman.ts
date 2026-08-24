/**
 * Builds the app's `HuvudmanRad[]` aggregate by grouping `listSkolor()`'s
 * rows by `huvudmannaOrgnr` — a real, reliable join key in this source
 * (unlike the old API, which had none and forced a name-based join
 * throughout the app). Falls back to the huvudman's name only for the
 * handful of rows that report no organisationsnummer at all.
 */

import { readAlltFile, registerFilePath } from "./client";
import { koncernForHuvudmanIndex } from "./koncern";
import { listSkolor } from "./resources";
import { huvudmanRadFörSlug } from "@/lib/huvudman-slugs";
import type { HuvudmanRad, SkolorRad } from "./types";

async function alltFile() {
  return readAlltFile(registerFilePath());
}

function huvudmanKey(s: SkolorRad): string {
  return s.huvudmannaOrgnr ?? `namn:${s.huvudman}`;
}

let huvudmanRowsCache: Promise<HuvudmanRad[]> | null = null;

export function buildHuvudmanRows(): Promise<HuvudmanRad[]> {
  if (!huvudmanRowsCache) {
    huvudmanRowsCache = (async () => {
      const [skolor, koncernIndex, file] = await Promise.all([
        listSkolor(),
        koncernForHuvudmanIndex(),
        alltFile(),
      ]);

      const grupper = new Map<string, SkolorRad[]>();
      for (const s of skolor) {
        const key = huvudmanKey(s);
        const grupp = grupper.get(key);
        if (grupp) grupp.push(s);
        else grupper.set(key, [s]);
      }

      const rows: HuvudmanRad[] = [];
      for (const [key, medlemmar] of grupper) {
        const första = medlemmar[0]!;
        const orgnr = första.huvudmannaOrgnr;
        const bolag = orgnr ? file.bolag[orgnr] : undefined;
        const koncern = orgnr ? (koncernIndex.get(orgnr) ?? null) : null;

        rows.push({
          organisationsnummer: orgnr ?? key,
          namn: första.huvudman,
          typ: första.huvudmannatyp,
          // `Grunduppgifter.bolagsform` is a copy of `huvudmannatyp`, not a
          // real legal form — the actual one lives in Bolagsverket's data,
          // when we have it.
          bolagsform: bolag?.organisation?.juridiskForm ?? null,
          koncern,
          kommuner: [
            ...new Set(
              medlemmar.map((s) => s.kommun).filter((k): k is string => k != null),
            ),
          ].sort((a, b) => a.localeCompare(b, "sv")),
          skolformer: [...new Set(medlemmar.flatMap((s) => s.skolformer))],
          antalEnheter: medlemmar.length,
          antalElever: medlemmar.reduce((sum, s) => sum + (s.antalElever ?? 0), 0),
          // The collector's own addresses, straight through — see
          // `HuvudmanKällhänvisning` for why only the first is ever a link.
          källor: {
            koncern: koncern?.källa ?? null,
            bolagsuppgifter: bolag?.kallor.organisation ?? null,
            årsredovisningar: bolag?.kallor.dokumentlista ?? null,
          },
        });
      }
      return rows;
    })();
  }
  return huvudmanRowsCache;
}

/**
 * The one place a `/huvudman/[slug]` URL resolves to its row —
 * `generateMetadata` and the page both resolve through this, so a title can
 * never describe a different huvudman than the one rendered. `null` when no
 * row carries the slug, which the route answers with not-found.
 *
 * Lives here rather than in `api-normalize.ts` because it reads the list:
 * that module runs in the browser and must not reach this barrel at runtime.
 */
export async function getHuvudmanBySlug(slug: string): Promise<HuvudmanRad | null> {
  return huvudmanRadFörSlug(await buildHuvudmanRows()).get(slug) ?? null;
}

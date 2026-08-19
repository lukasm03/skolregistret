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

        rows.push({
          organisationsnummer: orgnr ?? key,
          namn: första.huvudman,
          typ: första.huvudmannatyp,
          // `Grunduppgifter.bolagsform` is a copy of `huvudmannatyp`, not a
          // real legal form — the actual one lives in Bolagsverket's data,
          // when we have it.
          bolagsform: bolag?.organisation?.juridiskForm ?? null,
          koncern: orgnr ? (koncernIndex.get(orgnr) ?? null) : null,
          kommuner: [
            ...new Set(
              medlemmar.map((s) => s.kommun).filter((k): k is string => k != null),
            ),
          ].sort((a, b) => a.localeCompare(b, "sv")),
          skolformer: [...new Set(medlemmar.flatMap((s) => s.skolformer))],
          antalEnheter: medlemmar.length,
          antalElever: medlemmar.reduce((sum, s) => sum + (s.antalElever ?? 0), 0),
        });
      }
      return rows;
    })();
  }
  return huvudmanRowsCache;
}

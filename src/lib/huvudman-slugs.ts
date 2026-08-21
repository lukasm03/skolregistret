import { slugify } from "./format";
import type { HuvudmanRad } from "@/lib/skolregister";

/**
 * How huvudmän get their `/huvudman/[slug]` addresses, and how a URL is
 * resolved back to its row.
 *
 * This module is deliberately free of any data-source import: it runs on
 * both the server (resolving pages) and in the browser (the list views
 * normalize through `api-normalize.ts`, which reaches these functions), and
 * pulling the register barrel in would drag `node:fs` into the client
 * bundle. The register-reading half — resolving a slug against
 * `listHuvudman()` — lives in `skolregister/huvudman.ts` as
 * `getHuvudmanBySlug`.
 */

/**
 * Every huvudman's address, keyed by the name the units join on.
 *
 * `slugify` folds accents, so two genuinely different huvudmän can land on
 * one slug: the register carries both `HÅBO KOMMUN` (Uppsala län) and
 * `HABO KOMMUN` (Jönköpings län), and both slug as `habo-kommun`. Before
 * this map existed the two resolvers disagreed about which one won —
 * `/huvudman/habo-kommun` rendered Håbo while `/skolor?huvudman=habo-kommun`
 * filtered on Habo's name — so Håbo's own "visa alla skolenheter" link
 * listed the other kommun's schools and Habo had no reachable page at all.
 *
 * The tie is broken on organisationsnummer rather than on list order: the
 * lowest orgnr keeps the bare slug and the rest take their orgnr as a
 * suffix, so an address stays put even if the collector reorders its export.
 * Rows sharing a name are one huvudman as far as the join is concerned and
 * get one slug between them — see `dedupeHuvudmanRows`.
 *
 * Generic over the row shape: it needs only a name and an orgnr, so it runs
 * unchanged on both full `HuvudmanRad`s and the `ListHuvudmanPayload` rows
 * the list pages ship.
 */
export function huvudmanSlugar<T extends { namn: string; organisationsnummer: string }>(
  rows: T[],
): Map<string, string> {
  const perSlug = new Map<string, T[]>();
  for (const row of dedupeHuvudmanRows(rows)) {
    const slug = slugify(row.namn);
    const grupp = perSlug.get(slug);
    if (grupp) grupp.push(row);
    else perSlug.set(slug, [row]);
  }

  const slugFörNamn = new Map<string, string>();
  for (const [slug, grupp] of perSlug) {
    if (grupp.length === 1) {
      slugFörNamn.set(grupp[0]!.namn, slug);
      continue;
    }
    const ordnade = [...grupp].sort((a, b) =>
      a.organisationsnummer.localeCompare(b.organisationsnummer),
    );
    ordnade.forEach((row, i) => {
      slugFörNamn.set(
        row.namn,
        i === 0 ? slug : `${slug}-${slugify(row.organisationsnummer)}`,
      );
    });
  }
  return slugFörNamn;
}

/**
 * The reverse of `huvudmanSlugar`, for resolving a URL back to its row.
 *
 * Memoized on the array itself: `listHuvudman()` hands out one cached array
 * per process and `getHuvudmanBySlug` runs twice for each of the thousand
 * huvudman pages a build prerenders, so rebuilding the index every time is
 * a thousand needless passes over the whole list. A `WeakMap` keyed on the
 * rows needs no invalidation — a new array is a new index by construction.
 */
const slugIndexPerRows = new WeakMap<HuvudmanRad[], Map<string, HuvudmanRad>>();

export function huvudmanRadFörSlug(rows: HuvudmanRad[]): Map<string, HuvudmanRad> {
  const memo = slugIndexPerRows.get(rows);
  if (memo) return memo;

  const slugFörNamn = huvudmanSlugar(rows);
  const index = new Map<string, HuvudmanRad>();
  for (const row of dedupeHuvudmanRows(rows)) {
    const slug = slugFörNamn.get(row.namn);
    if (slug) index.set(slug, row);
  }
  slugIndexPerRows.set(rows, index);
  return index;
}

/**
 * Two rows carrying the *same* name are one huvudman to every consumer of
 * this list: `aggregateHuvudman` joins units by name, so both rows would
 * aggregate the identical unit set and render as duplicate lines. Collapsing
 * to the first occurrence keeps the list to one row per name.
 *
 * Only exact names collapse. Two rows that merely slugify alike are two
 * huvudmän with two unit sets, and dropping one of those was the Håbo/Habo
 * bug — `huvudmanSlugar` gives them separate addresses instead.
 */
export function dedupeHuvudmanRows<T extends { namn: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const row of rows) {
    if (seen.has(row.namn)) continue;
    seen.add(row.namn);
    result.push(row);
  }
  return result;
}

import type { Metadata } from "next";
import { SchoolsView } from "@/components/views/SchoolsView";
import { site } from "@/config/site";
import { huvudmanRadFörSlug, toListSchoolPayload } from "@/lib/api-normalize";
import { listHuvudman, listSkolor } from "@/lib/skolregister";

export const metadata: Metadata = {
  title: "Skolenheter",
  description: `Alla skolenheter i ${site.riket.toLowerCase()} — sök och filtrera på kommun, skolform, huvudman, årskurs och elevantal.`,
};

/**
 * The list filters in the browser, so the page's job is to hand it the
 * register once and let it get on with it — every filter change after that
 * re-renders the table without touching the server. The rows go through
 * `toListSchoolPayload` first: four of `SkolorRad`'s fields are never read
 * here, and at 6 500 copies each they would otherwise be most of the payload.
 *
 * The register itself comes
 * from the skolregister API rather than the seed-data loaders, so this page
 * has no build-time dependency on the data source.
 *
 * Prerendered at build time (no `searchParams`, so nothing here forces
 * dynamic rendering) — `SchoolsView` reads the actual URL on mount via
 * `useQueryParams`, so a shared filtered link still renders filtered.
 */
export default async function SkolorPage() {
  const [schools, huvudman] = await Promise.all([listSkolor(), listHuvudman()]);

  // The huvudman filter is a slug in the URL, and the name behind it is what
  // the row join compares against. Both come from the same index
  // `/huvudman/[slug]` resolves through, so `?huvudman=` and the detail page
  // can never disagree about which huvudman a slug means — they did, for the
  // two kommuner that slug alike. See `huvudmanSlugar`.
  const huvudmanNames = Object.fromEntries(
    [...huvudmanRadFörSlug(huvudman)].map(([slug, h]) => [slug, h.namn]),
  );

  return (
    <SchoolsView
      schools={toListSchoolPayload(schools)}
      initialParams={{}}
      huvudmanNames={huvudmanNames}
    />
  );
}

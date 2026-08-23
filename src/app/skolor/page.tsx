import type { Metadata } from "next";
import { SchoolsView } from "@/components/views/SchoolsView";
import { site } from "@/config/site";
import type { RawParams } from "@/lib/query";
import { toListSchoolPayload } from "@/lib/api-normalize";
import { huvudmanRadFörSlug } from "@/lib/huvudman-slugs";
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
 * Rendered per request, because it reads `searchParams`. It used to be
 * prerendered, with the view picking the query string up on mount — which
 * meant a shared link like `?kommun=0180&skolform=GR` painted the whole
 * register first and swapped to the filtered list a beat later, on exactly
 * the URLs people pass around. It also meant the header's plain GET search
 * form, the one the detail pages fall back to without JavaScript, landed
 * here and was ignored. Reading the params on the server fixes both; the
 * ~7 700 detail pages, which are the bulk of the build, stay static.
 */
export default async function SkolorPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const params = await searchParams;
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
      initialParams={params}
      huvudmanNames={huvudmanNames}
    />
  );
}

import type { Metadata } from "next";
import { KoncernView } from "@/components/views/KoncernView";
import { site } from "@/config/site";
import type { RawParams } from "@/lib/query";
import { buildKoncernGroups } from "@/lib/skolregister";

export const metadata: Metadata = {
  title: "Koncerner",
  description: `Skolkoncerner i ${site.riket.toLowerCase()} — huvudmän, skolenheter och elevantal räknat samman per koncernmoder.`,
};

/**
 * As with `/huvudman` and `/skolor`: the koncern groups go over once, and
 * `KoncernView` filters and paginates them in the browser from then on.
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
export default async function KoncernListPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const params = await searchParams;
  const groups = await buildKoncernGroups();

  return <KoncernView groups={groups} initialParams={params} />;
}

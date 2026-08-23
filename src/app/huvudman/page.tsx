import type { Metadata } from "next";
import { HuvudmanView } from "@/components/views/HuvudmanView";
import { site } from "@/config/site";
import type { RawParams } from "@/lib/query";
import { toListHuvudmanPayload, toListSchoolPayload } from "@/lib/api-normalize";
import { listHuvudman, listSkolor } from "@/lib/skolregister";

export const metadata: Metadata = {
  title: "Huvudmän",
  description: `Alla skolhuvudmän i ${site.riket.toLowerCase()} — kommunala och fristående, med skolenheter, elevantal och koncerntillhörighet.`,
};

/**
 * As with the skolenhet list: the data goes over once, and the view
 * aggregates and filters it in the browser from then on. The register comes
 * from the skolregister API, same as `/skolor` — see `HuvudmanView` for the
 * normalization into the shapes the aggregation reads.
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
export default async function HuvudmanListPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const params = await searchParams;
  const [huvudman, schools] = await Promise.all([listHuvudman(), listSkolor()]);

  // Both lists are trimmed before they cross to the browser — the huvudman
  // rows in particular, whose full shape carries a whole ownership tree per
  // row that this page never renders. See `toListHuvudmanPayload` /
  // `toListSchoolPayload`.
  return (
    <HuvudmanView
      huvudman={toListHuvudmanPayload(huvudman)}
      schools={toListSchoolPayload(schools)}
      initialParams={params}
    />
  );
}

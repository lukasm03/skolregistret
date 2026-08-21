import type { Metadata } from "next";
import { HuvudmanView } from "@/components/views/HuvudmanView";
import { site } from "@/config/site";
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
 * Prerendered at build time (no `searchParams`, so nothing here forces
 * dynamic rendering) — `HuvudmanView` reads the actual URL on mount via
 * `useQueryParams`, so a shared filtered link still renders filtered.
 */
export default async function HuvudmanListPage() {
  const [huvudman, schools] = await Promise.all([listHuvudman(), listSkolor()]);

  // Both lists are trimmed before they cross to the browser — the huvudman
  // rows in particular, whose full shape carries a whole ownership tree per
  // row that this page never renders. See `toListHuvudmanPayload` /
  // `toListSchoolPayload`.
  return (
    <HuvudmanView
      huvudman={toListHuvudmanPayload(huvudman)}
      schools={toListSchoolPayload(schools)}
      initialParams={{}}
    />
  );
}

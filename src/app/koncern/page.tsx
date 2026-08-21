import type { Metadata } from "next";
import { KoncernView } from "@/components/views/KoncernView";
import { site } from "@/config/site";
import { buildKoncernGroups } from "@/lib/skolregister";

export const metadata: Metadata = {
  title: "Koncerner",
  description: `Skolkoncerner i ${site.riket.toLowerCase()} — huvudmän, skolenheter och elevantal räknat samman per koncernmoder.`,
};

/**
 * As with `/huvudman` and `/skolor`: the koncern groups go over once, and
 * `KoncernView` filters and paginates them in the browser from then on.
 *
 * Prerendered at build time (no `searchParams`, so nothing here forces
 * dynamic rendering) — `KoncernView` reads the actual URL on mount via
 * `useQueryParams`, so a shared filtered link still renders filtered.
 */
export default async function KoncernListPage() {
  const groups = await buildKoncernGroups();

  return <KoncernView groups={groups} initialParams={{}} />;
}

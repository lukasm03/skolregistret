import { HuvudmanView } from "@/components/views/HuvudmanView";
import { listHuvudman, listSkolor } from "@/lib/skolregister-api";

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

  return <HuvudmanView huvudman={huvudman} schools={schools} initialParams={{}} />;
}

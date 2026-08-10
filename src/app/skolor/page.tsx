import { SchoolsView } from "@/components/views/SchoolsView";
import { slugify } from "@/lib/format";
import { listHuvudman, listSkolor } from "@/lib/skolregister";

/**
 * The list filters in the browser, so the page's job is to hand it the
 * register once and let it get on with it — every filter change after that
 * re-renders the table without touching the server. The register itself comes
 * from the skolregister API rather than the seed-data loaders, so this page
 * has no build-time dependency on the data source.
 *
 * Prerendered at build time (no `searchParams`, so nothing here forces
 * dynamic rendering) — `SchoolsView` reads the actual URL on mount via
 * `useQueryParams`, so a shared filtered link still renders filtered.
 */
export default async function SkolorPage() {
  const [schools, huvudman] = await Promise.all([listSkolor(), listHuvudman()]);

  // The huvudman filter is a slug in the URL; the API has no slug field, but
  // `/huvudman/[slug]` derives it the same way — slugifying the name.
  const huvudmanNames = Object.fromEntries(
    huvudman.map((h) => [slugify(h.namn), h.namn]),
  );

  return (
    <SchoolsView schools={schools} initialParams={{}} huvudmanNames={huvudmanNames} />
  );
}

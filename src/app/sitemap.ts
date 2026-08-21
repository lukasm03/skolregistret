import type { MetadataRoute } from "next";
import { site } from "@/config/site";
import { huvudmanRadFörSlug } from "@/lib/api-normalize";
import { buildKoncernGroups, listHuvudman, listSkolor } from "@/lib/skolregister";

/**
 * Every prerendered public page, enumerated from the same sources the routes'
 * own `generateStaticParams` read at build time — so a row that gets a page
 * gets an entry, and a slug collision's orgnr-suffixed address is listed
 * exactly as it is served.
 *
 * The register sits well under one sitemap file's 50 000-URL ceiling, so
 * there is no `generateSitemaps` splitting. No `lastModified`: the source
 * export carries no per-row revision date, and stamping the build time on
 * all ~7 700 entries would tell crawlers everything changed, which says
 * nothing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [skolor, huvudman] = await Promise.all([listSkolor(), listHuvudman()]);
  const [koncernGrupper] = await Promise.all([buildKoncernGroups()]);

  return [
    "",
    "/skolor",
    "/huvudman",
    "/koncern",
    ...skolor.map((s) => `/skolor/${s.skolenhetskod}`),
    ...[...huvudmanRadFörSlug(huvudman).keys()].map((slug) => `/huvudman/${slug}`),
    ...koncernGrupper.map((g) => `/koncern/${g.slug}`),
  ].map((path): MetadataRoute.Sitemap[number] => ({ url: `${site.url}${path}` }));
}

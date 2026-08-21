import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { KoncernTree } from "@/components/detail/KoncernTree";
import { DataTable, type Column } from "@/components/ui/DataTable";
import {
  BackLink,
  Dot,
  FactList,
  Note,
  RailSection,
  SectionTitle,
  Stat,
  StatGrid,
} from "@/components/ui/primitives";
import { site } from "@/config/site";
import { DASH, isoDate, num, plural, slugify } from "@/lib/format";
import { huvudmanSlugar } from "@/lib/huvudman-slugs";
import { buildKoncernGroups, getKoncernBySlug, listHuvudman } from "@/lib/skolregister";
import type { HuvudmanRad } from "@/lib/skolregister";

const dotterbolagColumns: Column<HuvudmanRad>[] = [
  { key: "namn", header: "Bolag", strong: true, truncate: true, cell: (d) => d.namn },
  { key: "typ", header: "Typ", width: 100, muted: true, cell: (d) => d.typ },
  {
    key: "kommuner",
    header: "Kommuner",
    width: 200,
    muted: true,
    truncate: true,
    cell: (d) => d.kommuner.join(", ") || DASH,
  },
  {
    key: "enheter",
    header: "Enheter",
    width: 84,
    align: "right",
    mono: true,
    cell: (d) => num(d.antalEnheter),
  },
  {
    key: "elever",
    header: "Elever",
    width: 84,
    align: "right",
    mono: true,
    cell: (d) => num(d.antalElever),
  },
];

/**
 * Statically generated for every koncern with at least one huvudman in the
 * register, the same way `/huvudman/[slug]` covers every huvudman.
 * `dynamicParams` stays at its default (`true`).
 */
export async function generateStaticParams() {
  const groups = await buildKoncernGroups();
  return groups.map((g) => ({ slug: g.slug }));
}

/** The register list is parsed once per process — see `/skolor/[kod]`. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const group = await getKoncernBySlug(slug);
  if (!group) return { title: "Koncernen finns inte" };

  const enheter = group.dotterbolag.reduce((sum, d) => sum + d.antalEnheter, 0);
  const elever = group.dotterbolag.reduce((sum, d) => sum + d.antalElever, 0);

  return {
    title: `${group.namn} · koncern`,
    description:
      `${group.namn} har ${plural(group.dotterbolag.length, "huvudman", "huvudmän")} i skolregistret, ` +
      `med ${plural(enheter, "skolenhet", "skolenheter")} och ${plural(elever, "elev", "elever")}.`,
  };
}

export default async function KoncernPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const group = await getKoncernBySlug(slug);
  if (!group) notFound();

  // The dotterbolag rows link to `/huvudman/[slug]`, and two huvudmän can
  // slug alike — only the full list knows which of them took the suffix.
  const huvudmanSlugFörNamn = huvudmanSlugar(await listHuvudman());

  const antalEnheter = group.dotterbolag.reduce((sum, d) => sum + d.antalEnheter, 0);
  const antalElever = group.dotterbolag.reduce((sum, d) => sum + d.antalElever, 0);
  const kommuner = [...new Set(group.dotterbolag.flatMap((d) => d.kommuner))].sort(
    (a, b) => a.localeCompare(b, "sv"),
  );
  const skolformer = [...new Set(group.dotterbolag.flatMap((d) => d.skolformer))];
  const restForetag =
    group.antalFöretag != null ? group.antalFöretag - group.dotterbolag.length : null;

  return (
    <AppShell
      section="/koncern"
      searchAction="/koncern"
      searchPlaceholder={site.search.koncern}
    >
      <div className="flex flex-col">
        <header className="flex flex-wrap items-start gap-x-6 gap-y-4 border-b border-line-soft px-4 pt-5 pb-[18px] sm:px-6">
          <div className="flex min-w-0 flex-col gap-2">
            <BackLink href="/koncern">Alla koncerner</BackLink>
            <h1 className="text-title leading-[1.15] font-semibold tracking-[-0.015em] text-balance">
              {group.namn}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-base text-ink-muted">Koncern</span>
              <Dot />
              <span translate="no" className="font-mono text-xs text-ink-subtle">
                Org.nr {group.orgNr}
              </span>
              <Dot />
              <span className="text-base text-ink-muted">
                {plural(
                  group.dotterbolag.length,
                  "huvudman i registret",
                  "huvudmän i registret",
                )}
              </span>
            </div>
          </div>
        </header>

        <StatGrid>
          <Stat
            label="Huvudmän i registret"
            value={num(group.dotterbolag.length)}
            note={
              restForetag != null && restForetag > 0
                ? `av ${num(group.antalFöretag)} bolag i koncernen`
                : undefined
            }
          />
          <Stat label="Skolenheter" value={num(antalEnheter)} />
          <Stat label="Elever" value={num(antalElever)} note="summa av avrundade tal" />
          <Stat
            label="Kommuner"
            value={num(kommuner.length)}
            note={kommuner.slice(0, 3).join(", ") || undefined}
          />
        </StatGrid>

        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-[26px] px-4 pt-5 pb-6 sm:px-6">
            <section className="flex flex-col gap-2.5">
              <SectionTitle note="klicka för att öppna huvudmannen">
                Dotterbolag
              </SectionTitle>
              <DataTable
                rows={group.dotterbolag}
                rowKey={(d) => d.organisationsnummer}
                rowHref={(d) =>
                  `/huvudman/${huvudmanSlugFörNamn.get(d.namn) ?? slugify(d.namn)}`
                }
                rowLabel={(d) => `Visa ${d.namn}`}
                emptyMessage="Inga huvudmän registrerade för den här koncernen."
                columns={dotterbolagColumns}
                label="Dotterbolag"
              />
            </section>

            <section className="flex flex-col gap-2.5">
              <SectionTitle note="Dun & Bradstreets ägarträd, som det bolaget rapporterar det">
                Ägarstruktur
              </SectionTitle>
              {group.träd.length ? (
                <KoncernTree träd={group.träd} />
              ) : (
                <Note>Inget ägarträd registrerat för den här koncernen.</Note>
              )}
            </section>
          </div>

          <aside className="flex w-full flex-col gap-[22px] border-t border-line-soft bg-surface-panel p-5 lg:w-[300px] lg:flex-none lg:border-t-0 lg:border-l">
            <RailSection title="Uppgifter" divided={false}>
              <FactList
                items={[
                  [
                    "Org.nr",
                    // An identifier, not prose — see `/skolor/[kod]`.
                    <span key="orgnr" translate="no">
                      {group.orgNr}
                    </span>,
                  ],
                  [
                    "Bolag i koncernen",
                    group.antalFöretag != null ? num(group.antalFöretag) : DASH,
                  ],
                  ["Dotterbolag i registret", num(group.dotterbolag.length)],
                  ["Skolformer", skolformer.join(", ") || DASH],
                ]}
              />
            </RailSection>

            <RailSection title="Källor">
              <FactList
                items={[
                  ["Huvudmän, enheter, elever", "Skolregistret"],
                  ["Ägarträd, koncernuppgifter", "Dun & Bradstreet"],
                ]}
              />
              <Note>
                {restForetag != null && restForetag > 0
                  ? `${num(restForetag)} bolag i koncernen driver ingen skolenhet och är inte huvudmän i registret.`
                  : "Alla bolag i koncernen är huvudmän i registret."}
              </Note>
              {group.asof && (
                <Note>{`Dun & Bradstreets ägaruppgifter är från ${isoDate(group.asof)}.`}</Note>
              )}
              {group.inaktuellt && (
                <Note>
                  Minst ett bolag i ägarträdet har avregistrerats sedan dess — bilden av
                  koncernen kan ha hunnit bli inaktuell.
                </Note>
              )}
            </RailSection>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

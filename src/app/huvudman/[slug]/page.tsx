import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { schoolColumns } from "@/components/tables/schoolColumns";
import { DataTable } from "@/components/ui/DataTable";
import {
  BackLink,
  ButtonLink,
  Dot,
  EmptyBox,
  FactList,
  KoncernPill,
  Note,
  RailSection,
  SectionTitle,
  Stat,
  StatGrid,
  StatusPill,
} from "@/components/ui/primitives";
import { site } from "@/config/site";
import { dedupeHuvudmanRows, normalizeApiSchool } from "@/lib/api-normalize";
import { DASH, num, plural, slugify } from "@/lib/format";
import { href } from "@/lib/query";
import { listHuvudman, listSkolor } from "@/lib/skolregister-api";

/**
 * Statically generated for every huvudman the register currently has, the
 * same way `/skolor/[kod]` covers every skolenhet — `dynamicParams` stays at
 * its default (`true`), so a huvudman added after the build still resolves.
 */
export async function generateStaticParams() {
  const rows = dedupeHuvudmanRows(await listHuvudman());
  return rows.map((h) => ({ slug: slugify(h.namn) }));
}

export default async function HuvudmanDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [huvudmanRows, skolor] = await Promise.all([listHuvudman(), listSkolor()]);
  const h = dedupeHuvudmanRows(huvudmanRows).find(
    (row) => slugify(row.namn) === slug,
  );
  if (!h) notFound();

  const units = skolor
    .filter((s) => s.huvudman === h.namn)
    .map(normalizeApiSchool);

  const isKommunal = h.typ === "Kommunal";
  const kedja = h.koncern?.kedja ?? [];
  // A `koncern` block with no name has been seen despite the declared type.
  const koncernSlug = h.koncern?.koncernNamn
    ? slugify(h.koncern.koncernNamn)
    : null;

  return (
    <AppShell
      section="/huvudman"
      crumbs={[{ label: "Huvudmän", href: "/huvudman" }, { label: h.namn }]}
      searchAction="/huvudman"
      searchPlaceholder={site.search.huvudman}
    >
      <div className="flex flex-col">
        <header className="flex items-start gap-6 border-b border-line-soft px-6 pt-5 pb-[18px]">
          <div className="flex min-w-0 flex-col gap-2">
            <BackLink href="/huvudman">Alla huvudmän</BackLink>
            <h1 className="text-title leading-[1.15] font-semibold tracking-[-0.015em]">
              {h.namn}
            </h1>
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusPill>
                {isKommunal ? "Kommunal verksamhet" : "Aktivt bolag"}
              </StatusPill>
              {koncernSlug && (
                <Link
                  href={`/koncern/${koncernSlug}`}
                  className="transition-opacity hover:opacity-80"
                >
                  <KoncernPill>Del av koncern</KoncernPill>
                </Link>
              )}
              <span className="text-base text-ink-muted">
                {isKommunal
                  ? "Kommunal huvudman"
                  : `Fristående huvudman${h.bolagsform ? ` · ${h.bolagsform}` : ""}`}
              </span>
              <Dot />
              <span className="font-mono text-xs text-ink-subtle">
                Org.nr {h.organisationsnummer}
              </span>
              <Dot />
              <span className="text-base text-ink-muted">
                {plural(h.kommuner.length, "kommun", "kommuner")}
              </span>
            </div>
          </div>
          <div className="flex-1" />
          {h.koncern && (
            <div className="flex items-start gap-[22px] pt-[22px]">
              <div className="flex flex-col items-end gap-1">
                <span className="text-micro font-semibold tracking-[0.08em] text-ink-subtle uppercase">
                  Koncernmoder
                </span>
                {koncernSlug ? (
                  <Link
                    href={`/koncern/${koncernSlug}`}
                    className="text-md font-medium text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
                  >
                    {h.koncern.koncernNamn}
                  </Link>
                ) : (
                  <span className="text-md font-medium">{DASH}</span>
                )}
              </div>
              <span className="h-[34px] w-px bg-line-softer" />
              <div className="flex flex-col items-end gap-1">
                <span className="text-micro font-semibold tracking-[0.08em] text-ink-subtle uppercase">
                  Bolag i koncernen
                </span>
                <span className="font-mono text-md">
                  {num(h.koncern.antalFöretag)}
                </span>
              </div>
            </div>
          )}
        </header>

        <StatGrid columns={4}>
          <Stat label="Skolenheter" value={num(h.antalEnheter)} />
          <Stat
            label="Elever"
            value={num(h.antalElever)}
            note="summa av avrundade tal"
          />
          <Stat
            label="Kommuner"
            value={num(h.kommuner.length)}
            note={h.kommuner.slice(0, 3).join(", ") || undefined}
          />
          <Stat
            label="Skolformer"
            value={num(h.skolformer.length)}
            note={h.skolformer.join(" · ") || undefined}
          />
        </StatGrid>

        <div className="flex items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-[26px] px-6 pt-5 pb-6">
            <section className="flex flex-col gap-2.5">
              <SectionTitle
                note={
                  h.koncern
                    ? "ägarkedjans led, i registrerad ordning"
                    : "ingen ägarkedja registrerad"
                }
              >
                Koncernstruktur
              </SectionTitle>
              {kedja.length ? (
                <ul className="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-surface-panel p-4">
                  {kedja.map((bolag, i) => (
                    <li
                      key={`${bolag}-${i}`}
                      className="flex items-center gap-1.5 text-sm text-ink"
                    >
                      {i > 0 && (
                        <span
                          aria-hidden
                          className="font-mono text-mono text-ink-ghost"
                        >
                          └
                        </span>
                      )}
                      {bolag}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyBox>
                  {isKommunal
                    ? "Kommunen är egen huvudman och ingår inte i någon bolagskoncern. Verksamheten styrs av utbildningsnämnden."
                    : "Bolaget har ingen registrerad ägarkedja i skolregistret."}
                </EmptyBox>
              )}
            </section>

            <section className="flex flex-col gap-2.5">
              <SectionTitle note="samtliga aktiva och vilande enheter">
                Enheter under huvudmannen
              </SectionTitle>
              <DataTable
                rows={units}
                rowKey={(s) => s.kod}
                rowHref={(s) => `/skolor/${s.kod}`}
                rowLabel={(s) => `Visa ${s.name}`}
                emptyMessage="Inga enheter registrerade för den här huvudmannen."
                columns={[
                  schoolColumns.name(),
                  schoolColumns.status(),
                  schoolColumns.kommun(),
                  schoolColumns.skolformer(),
                  schoolColumns.elever(),
                ]}
              />
            </section>
          </div>

          <aside className="flex w-[300px] flex-none flex-col gap-[22px] border-l border-line-soft bg-surface-panel p-5">
            <RailSection title="Uppgifter" divided={false}>
              <FactList
                items={[
                  ["Org.nr", h.organisationsnummer],
                  ["Typ", h.typ],
                  ["Bolagsform", h.bolagsform ?? DASH],
                  [
                    "Koncernmoder",
                    koncernSlug ? (
                      <Link
                        key="koncern"
                        href={`/koncern/${koncernSlug}`}
                        className="text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
                      >
                        {h.koncern?.koncernNamn}
                      </Link>
                    ) : (
                      DASH
                    ),
                  ],
                  [
                    "Koncernens org.nr",
                    <span key="korgnr" className="font-mono text-sm">
                      {h.koncern?.koncernOrgNr ?? DASH}
                    </span>,
                  ],
                  ["Kommuner", h.kommuner.join(", ") || DASH],
                ]}
              />
            </RailSection>

            <RailSection title="Källor">
              <FactList
                items={[
                  ["Enheter, elever, koncern", "Skolregistret"],
                ]}
              />
              <Note>
                Elevtalen är avrundade per enhet, så summor drar iväg några
                tiotal.
              </Note>
            </RailSection>

            <div className="mt-auto flex flex-col gap-2">
              <ButtonLink
                href={href("/skolor", {}, { huvudman: slug })}
              >
                Visa enheterna i träfflistan
              </ButtonLink>
              <p className="text-center font-mono text-micro text-ink-faint">
                hämtat live · cache 60 s
              </p>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

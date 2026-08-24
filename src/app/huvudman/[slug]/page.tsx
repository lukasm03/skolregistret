import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArsredovisningList } from "@/components/detail/ArsredovisningList";
import { Disclosure } from "@/components/detail/Disclosure";
import { HuvudmanKällor } from "@/components/detail/Kallor";
import { HuvudmanEnheterView } from "@/components/detail/HuvudmanEnheterView";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, type TabDef } from "@/components/ui/Tabs";
import {
  BackLink,
  Dot,
  EmptyBox,
  FactList,
  KoncernPill,
  Stat,
  StatGrid,
  StatusPill,
} from "@/components/ui/primitives";
import { site } from "@/config/site";
import { harÅrsredovisningskatalog, listÅrsredovisningar } from "@/lib/arsredovisning";
import { normalizeApiSchool } from "@/lib/api-normalize";
import { huvudmanRadFörSlug } from "@/lib/huvudman-slugs";
import { DASH, kommunLong, num, plural, slugify } from "@/lib/format";
import {
  ancestorPath,
  getHuvudmanBySlug,
  listHuvudman,
  listSkolor,
} from "@/lib/skolregister";

/**
 * Statically generated for every huvudman the register currently has, the
 * same way `/skolor/[kod]` covers every skolenhet — `dynamicParams` stays at
 * its default (`true`), so a huvudman added after the build still resolves.
 */
export async function generateStaticParams() {
  // `huvudmanRadFörSlug` is the same index `getHuvudmanBySlug` resolves
  // through, so every param generated here is one the page can look up —
  // including the orgnr-suffixed address a name collision earns.
  return [...huvudmanRadFörSlug(await listHuvudman()).keys()].map((slug) => ({ slug }));
}

/** The register list is parsed once per process — see `/skolor/[kod]`. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const h = await getHuvudmanBySlug(slug);
  if (!h) return { title: "Huvudmannen finns inte" };

  const var_ =
    h.kommuner.length === 1
      ? ` i ${kommunLong(h.kommuner[0])}`
      : ` i ${plural(h.kommuner.length, "kommun", "kommuner")}`;

  return {
    title: `${h.namn} · ${h.typ.toLowerCase()} huvudman`,
    description:
      `${h.namn} driver ${plural(h.antalEnheter, "skolenhet", "skolenheter")}${var_} ` +
      `med ${plural(h.antalElever, "elev", "elever")}.` +
      (h.koncern?.koncernNamn ? ` Ingår i koncernen ${h.koncern.koncernNamn}.` : ""),
  };
}

export default async function HuvudmanDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [h, skolor] = await Promise.all([getHuvudmanBySlug(slug), listSkolor()]);
  if (!h) notFound();

  const units = skolor.filter((s) => s.huvudman === h.namn).map(normalizeApiSchool);
  // Keyed by organisationsnummer, which is also how the packages are filed —
  // a huvudman without one (the name-keyed fallback rows) simply has none.
  const [årsredovisningar, harKatalog] = await Promise.all([
    listÅrsredovisningar(h.organisationsnummer),
    harÅrsredovisningskatalog(),
  ]);
  // An empty list means two different things, and the empty box says which:
  // no packages collected for this bolag, or no package directory at all
  // (a fresh clone — the packages are supplied locally, see AGENTS.md).
  const saknarPaketkatalog = årsredovisningar.length === 0 && !harKatalog;

  const isKommunal = h.typ === "Kommunal";
  // Just the path from the koncernmoder down to this huvudman — the full
  // branching tree belongs on `/koncern`, where siblings are the point.
  const kedja = h.koncern
    ? (ancestorPath(h.koncern.träd, h.organisationsnummer) ?? [])
    : [];
  // A `koncern` block with no name has been seen despite the declared type.
  const koncernSlug = h.koncern?.koncernNamn ? slugify(h.koncern.koncernNamn) : null;

  const tabs: TabDef[] = [
    {
      id: "skolenheter",
      label: "Skolenheter",
      count: units.length,
      content: <HuvudmanEnheterView units={units} />,
    },
    {
      id: "uppgifter",
      label: "Huvudmannauppgifter",
      count: 3,
      content: (
        <div className="flex flex-col gap-6">
          <Disclosure title="Huvudmannauppgifter" count={4} defaultOpen>
            <FactList
              twoColumn
              items={[
                [
                  "Org.nr",
                  // An identifier, not prose — see `/skolor/[kod]`.
                  <span key="orgnr" translate="no">
                    {h.organisationsnummer}
                  </span>,
                ],
                ["Typ", h.typ],
                ["Bolagsform", h.bolagsform ?? DASH],
                ["Kommuner", h.kommuner.join(", ") || DASH],
              ]}
            />
          </Disclosure>

          {/* The count is this section's own facts, not the chain's length —
              a huvudman outside any koncern read "ÄGARSTRUKTUR 0" before. */}
          <Disclosure title="Ägarstruktur" count={kedja.length ? 3 : undefined}>
            {kedja.length ? (
              <FactList
                twoColumn
                items={[
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
                    <span key="korgnr" translate="no" className="font-mono text-sm">
                      {h.koncern?.koncernOrgNr ?? DASH}
                    </span>,
                  ],
                  [
                    "Bolag i koncernen",
                    <span key="antal" className="flex items-baseline gap-2">
                      <span className="font-mono text-sm">
                        {h.koncern?.antalFöretag != null
                          ? num(h.koncern.antalFöretag)
                          : DASH}
                      </span>
                      {koncernSlug && (
                        <Link
                          href={`/koncern/${koncernSlug}`}
                          className="text-sm text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
                        >
                          Visa koncernsidan
                        </Link>
                      )}
                    </span>,
                  ],
                ]}
              />
            ) : (
              <EmptyBox>
                {isKommunal
                  ? "Kommunen är egen huvudman och ingår inte i någon bolagskoncern. Verksamheten styrs av utbildningsnämnden."
                  : "Bolaget har ingen registrerad ägarkedja i skolregistret."}
              </EmptyBox>
            )}
          </Disclosure>

          <HuvudmanKällor
            källor={h.källor}
            harÅrsredovisningar={årsredovisningar.length > 0}
          />
        </div>
      ),
    },
    {
      id: "arsredovisningar",
      label: "Årsredovisningar",
      count: årsredovisningar.length,
      content: årsredovisningar.length ? (
        <div className="flex flex-col gap-3">
          <ArsredovisningList orgnr={h.organisationsnummer} poster={årsredovisningar} />
        </div>
      ) : (
        <EmptyBox>
          {isKommunal
            ? "Kommunala huvudmän lämnar ingen egen årsredovisning till Bolagsverket — skolverksamheten redovisas i kommunens årsredovisning."
            : saknarPaketkatalog
              ? "Inga årsredovisningar är hämtade lokalt."
              : "Inga inlämnade årsredovisningar är hämtade för det här organisationsnumret."}
        </EmptyBox>
      ),
    },
  ];

  return (
    <AppShell
      section="/huvudman"
      searchAction="/huvudman"
      searchPlaceholder={site.search.huvudman}
    >
      <div className="flex flex-col">
        <header className="flex flex-col gap-2.5 border-b border-line-soft px-4 pt-5 pb-[18px] sm:px-6">
          <BackLink href="/huvudman">Alla huvudmän</BackLink>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-title leading-[1.15] font-semibold tracking-[-0.015em] text-balance">
              {h.namn}
            </h1>
            <StatusPill>{isKommunal ? "Kommunal verksamhet" : "Aktivt bolag"}</StatusPill>
            {koncernSlug && (
              <Link href={`/koncern/${koncernSlug}`} className="group">
                <KoncernPill>Del av koncern</KoncernPill>
              </Link>
            )}
          </div>
          {/* What the huvudman is, rather than how big it is — the counts
              moved to the tiles below. */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-0.5">
            <span translate="no" className="font-mono text-sm text-ink-subtle">
              Org.nr {h.organisationsnummer}
            </span>
            <Dot />
            <span className="text-base text-ink-muted">
              {isKommunal
                ? "Kommunal huvudman"
                : `Fristående huvudman${h.bolagsform ? ` · ${h.bolagsform}` : ""}`}
            </span>
            {h.skolformer.length > 0 && (
              <>
                <Dot />
                <span className="text-base text-ink-muted">
                  {h.skolformer.join(" · ")}
                </span>
              </>
            )}
            <span className="hidden flex-1 sm:block" />
            <Link
              href={`/skolor?huvudman=${encodeURIComponent(slug)}`}
              className="text-base text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
            >
              Visa enheterna i träfflistan
            </Link>
          </div>
        </header>

        {/* The koncern page's tiles, for the same reason the skolenhet page
            now has them — see the note there. */}
        <StatGrid>
          <Stat label="Skolenheter" value={num(h.antalEnheter)} />
          <Stat label="Elever" value={num(h.antalElever)} note="summa av avrundade tal" />
          <Stat
            label="Kommuner"
            value={num(h.kommuner.length)}
            note={h.kommuner.slice(0, 3).join(", ") || undefined}
          />
        </StatGrid>

        <div className="flex flex-col gap-6 px-4 pt-5 pb-6 sm:px-6">
          <Tabs tabs={tabs} defaultTab="skolenheter" />
        </div>
      </div>
    </AppShell>
  );
}

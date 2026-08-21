import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArsredovisningKälla,
  ArsredovisningList,
} from "@/components/detail/ArsredovisningList";
import { Disclosure } from "@/components/detail/Disclosure";
import { HuvudmanEnheterView } from "@/components/detail/HuvudmanEnheterView";
import { AppShell } from "@/components/layout/AppShell";
import { Tabs, type TabDef } from "@/components/ui/Tabs";
import {
  BackLink,
  Dot,
  EmptyBox,
  FactList,
  KoncernPill,
  Note,
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
      views: [
        {
          id: "lista",
          label: "Lista",
          hint: "Enheterna under huvudmannen, sökbara och filtrerbara",
          content: <HuvudmanEnheterView units={units} />,
        },
      ],
    },
    {
      id: "uppgifter",
      label: "Huvudmannauppgifter",
      count: 3,
      views: [
        {
          id: "lista",
          label: "Lista",
          hint: "Registeruppgifter, ägarstruktur och källor",
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

              <Disclosure title="Ägarstruktur" count={h.koncern ? kedja.length : 0}>
                {kedja.length ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-baseline gap-1.5 text-base">
                      <span className="text-ink-muted">
                        {plural(kedja.length, "led", "led")}
                      </span>
                      {kedja.map((nod, i) => (
                        <span key={nod.orgnr} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-line-control">→</span>}
                          <span>{nod.namn ?? nod.orgnr}</span>
                        </span>
                      ))}
                    </div>
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
                  </div>
                ) : (
                  <EmptyBox>
                    {isKommunal
                      ? "Kommunen är egen huvudman och ingår inte i någon bolagskoncern. Verksamheten styrs av utbildningsnämnden."
                      : "Bolaget har ingen registrerad ägarkedja i skolregistret."}
                  </EmptyBox>
                )}
              </Disclosure>

              <Disclosure title="Källor" count={2}>
                <FactList
                  twoColumn
                  items={[
                    ["Enheter, elever, koncern", "Skolregistret"],
                    ["Årsredovisningar", årsredovisningar.length ? "Bolagsverket" : DASH],
                  ]}
                />
                <Note>
                  Elevtalen är avrundade per enhet, så summor drar iväg några tiotal.
                </Note>
              </Disclosure>
            </div>
          ),
        },
      ],
    },
    {
      id: "arsredovisningar",
      label: "Årsredovisningar",
      count: årsredovisningar.length,
      views: [
        {
          id: "lista",
          label: "Lista",
          hint: "Inlämnade räkenskapsår, senaste först",
          content: årsredovisningar.length ? (
            <div className="flex flex-col gap-3">
              <ArsredovisningList
                orgnr={h.organisationsnummer}
                poster={årsredovisningar}
              />
              <ArsredovisningKälla />
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
      ],
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
          <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
            <span translate="no" className="font-mono text-xs text-ink-subtle">
              Org.nr {h.organisationsnummer}
            </span>
            <Dot />
            <span className="text-base text-ink-muted">
              {isKommunal
                ? "Kommunal huvudman"
                : `Fristående huvudman${h.bolagsform ? ` · ${h.bolagsform}` : ""}`}
            </span>
          </div>
        </header>

        <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 border-b border-line-soft bg-surface-subtle px-4 py-2.5 sm:px-6">
          <span className="text-base text-ink-muted">
            <span className="font-mono text-md font-medium text-ink">
              {num(h.antalEnheter)}
            </span>{" "}
            skolenheter
          </span>
          <Dot />
          <span className="text-base text-ink-muted">
            <span className="font-mono text-md font-medium text-ink">
              {num(h.antalElever)}
            </span>{" "}
            elever
          </span>
          <Dot />
          <span className="text-base text-ink-muted">
            <span className="font-mono text-md font-medium text-ink">
              {num(h.kommuner.length)}
            </span>{" "}
            {plural(h.kommuner.length, "kommun", "kommuner")}
          </span>
          {h.skolformer.length > 0 && (
            <>
              <Dot />
              <span className="text-base text-ink-muted">{h.skolformer.join(" · ")}</span>
            </>
          )}
          <div className="flex-1" />
          <Link
            href={`/skolor?huvudman=${encodeURIComponent(slug)}`}
            className="text-sm text-accent underline decoration-accent-line underline-offset-2 hover:decoration-accent"
          >
            Visa enheterna i träfflistan
          </Link>
        </div>

        <div className="flex flex-col gap-6 px-4 pt-5 pb-6 sm:px-6">
          <Tabs tabs={tabs} defaultTab="skolenheter" />
        </div>
      </div>
    </AppShell>
  );
}

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HuvudmanKällor, SkolaKällor } from "./Kallor";
import type { HuvudmanKällhänvisning, SkolaKällhänvisning } from "@/lib/skolregister";

/**
 * What the Källor rows link to.
 *
 * Two things are worth pinning. The first is that a row prefers the address
 * the collector recorded for *this* subject over the source's front door —
 * the whole point of carrying `Skolinfo.kallor` up through the contract, and
 * a thing that silently degrades to a front-door link if a key stops
 * resolving. The second is that Bolagsverkets token-gated `gw.api` addresses
 * never become an href: they are provenance, and linking one hands the reader
 * an error page.
 *
 * Static markup rather than a DOM, the same way `rows.test.tsx` does it.
 */

const ENHET = "https://api.skolverket.se/planned-educations/v4/school-units/10023937";

const källor: SkolaKällhänvisning = {
  registeruppgifter: ENHET,
  nyckeltal: `${ENHET}/statistics/gr`,
  salsa: "https://api.skolverket.se/planned-educations/v4/statistics/all-schools/salsa",
  enkät: `${ENHET}/nestedsurveys/pupilsgr`,
  dokument: `${ENHET}/documents`,
};

function skola(över: Partial<SkolaKällhänvisning> = {}, harProgramsnitt = false): string {
  return renderToStaticMarkup(
    <SkolaKällor
      namn="Mimerskolan"
      källor={{ ...källor, ...över }}
      statistikLäsår="2024/25"
      enkätLäsår="2024/25"
      salsaLäsår="2023/24"
      harBeräknatRiks
      harProgramsnitt={harProgramsnitt}
      harSalsa
      harEnkät
      harDokument
      byggd="2026-08-24T15:16:21.047Z"
    />,
  );
}

const huvudmanKällor: HuvudmanKällhänvisning = {
  koncern: "https://www.hitta.se/f%C3%B6retagsinformation/x/5565715892",
  bolagsuppgifter:
    "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer",
  årsredovisningar:
    "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista",
};

describe("SkolaKällor", () => {
  test("links each row at the resource that row's figures were read from", () => {
    const html = skola();
    expect(html).toContain(`href="${ENHET}"`);
    expect(html).toContain(`href="${ENHET}/statistics/gr"`);
    expect(html).toContain(`href="${ENHET}/nestedsurveys/pupilsgr"`);
    expect(html).toContain(`href="${ENHET}/documents"`);
  });

  test("names the school in the link, not just the authority", () => {
    // "Skolverkets statistik-API" alone, read out of the row it sits in,
    // does not say whose statistics it opens.
    expect(skola()).toContain("Skolverkets statistik-API — posten för Mimerskolan");
  });

  test("falls back to the source's own address where the data cites none", () => {
    const html = skola({ nyckeltal: null });
    expect(html).toContain('href="https://api.skolverket.se/planned-educations/"');
  });

  test("says a figure is ours only where one of the shown ones is", () => {
    expect(skola()).not.toContain("snitt av programmen");
    expect(skola({}, true)).toContain("snitt av programmen");
  });
});

describe("HuvudmanKällor", () => {
  test("never links a Bolagsverket address that needs a token", () => {
    const html = renderToStaticMarkup(
      <HuvudmanKällor källor={huvudmanKällor} harÅrsredovisningar />,
    );
    expect(html).not.toContain("gw.api.bolagsverket.se");
    expect(html).toContain('href="https://bolagsverket.se/"');
  });

  test("links the koncern tree at the company lookup it was built from", () => {
    const html = renderToStaticMarkup(
      <HuvudmanKällor källor={huvudmanKällor} harÅrsredovisningar />,
    );
    expect(html).toContain(`href="${huvudmanKällor.koncern}"`);
  });

  test("drops the ägarstruktur row for a huvudman outside every koncern", () => {
    const html = renderToStaticMarkup(
      <HuvudmanKällor
        källor={{ ...huvudmanKällor, koncern: null }}
        harÅrsredovisningar={false}
      />,
    );
    expect(html).not.toContain("Ägarstruktur");
  });
});

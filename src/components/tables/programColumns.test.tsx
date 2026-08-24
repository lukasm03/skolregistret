import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "@/components/ui/DataTable";
import { programColumns } from "./programColumns";
import { buildProgramComparisons } from "@/lib/program-compare";
import type {
  NationelltProgramGenomsnitt,
  NyckeltalVärde,
  ProgramNyckeltalKey,
  SkolaProgram,
} from "@/lib/skolregister";

/**
 * What the program tab prints, and the one rule the columns carry that the
 * types do not: a measure with no better direction shows its figure and
 * nothing under it.
 *
 * The old table drew that rule as an absence of colour, which a reader could
 * miss; here the difference itself is withheld, because "+64 elever mot
 * riket" reads as a verdict on a programme that is merely larger. Nothing in
 * `program-compare.ts` can catch this — it computes the difference either
 * way, and `riktning: "none"` is the column's cue to drop it.
 *
 * Static markup rather than a DOM, the same way `rows.test.tsx` does it.
 */

const finns = (tal: number, text = String(tal).replace(".", ",")): NyckeltalVärde => ({
  status: "finns",
  text,
  tal,
  läsår: "2024/25",
});

const saknas: NyckeltalVärde = {
  status: "saknas",
  förklaring: "uppgift saknas",
  läsår: null,
};

function program(elever: number, betyg: number | null): SkolaProgram {
  return {
    kod: "NA",
    namn: "Naturvetenskapsprogrammet",
    antalElever: finns(elever),
    nyckeltal: {
      lägstaAntagningspoäng: saknas,
      genomsnittligAntagningspoäng: saknas,
      andelMedExamenInom3År: saknas,
      betygspoängMedExamen: betyg == null ? saknas : finns(betyg),
      andelMedHögskolebehörighet: saknas,
    },
  };
}

/** Riket for the same programme — every metric the endpoint reports, present or not. */
function riks(
  values: Partial<Record<ProgramNyckeltalKey, NyckeltalVärde>>,
): Map<string, NationelltProgramGenomsnitt> {
  return new Map([
    [
      "NA",
      {
        skolform: "gy",
        programkod: "NA",
        nyckeltal: {
          antalElever: values.antalElever ?? saknas,
          lägstaAntagningspoäng: values.lägstaAntagningspoäng ?? saknas,
          genomsnittligAntagningspoäng: values.genomsnittligAntagningspoäng ?? saknas,
          andelMedExamenInom3År: values.andelMedExamenInom3År ?? saknas,
          betygspoängMedExamen: values.betygspoängMedExamen ?? saknas,
          andelMedHögskolebehörighet: values.andelMedHögskolebehörighet ?? saknas,
        },
      } satisfies NationelltProgramGenomsnitt,
    ],
  ]);
}

function markup(p: SkolaProgram, r: Map<string, NationelltProgramGenomsnitt>): string {
  return renderToStaticMarkup(
    <DataTable
      columns={programColumns}
      rows={buildProgramComparisons([p], r, new Map())}
      rowKey={(row) => row.kod}
      label="Program"
    />,
  );
}

describe("programColumns", () => {
  test("prints the difference under a measure that has a better direction", () => {
    const html = markup(program(120, 16.9), riks({ betygspoängMedExamen: finns(16.4) }));
    expect(html).toContain("16,9");
    expect(html).toContain("+0,5");
  });

  test("withholds it where higher is neither better nor worse", () => {
    const html = markup(program(120, null), riks({ antalElever: finns(56) }));
    expect(html).toContain("120");
    // The programme is 64 elever above riket, and that is not a verdict.
    expect(html).not.toContain("+64");
  });

  test("names every measure in the header, abbreviated but titled", () => {
    const html = markup(program(120, null), riks({}));
    expect(html).toContain("Betygspoäng");
    expect(html).toContain("Andel elever med examen inom tre år.");
  });
});

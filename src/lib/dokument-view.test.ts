import { describe, expect, test } from "bun:test";
import { antalDokument, buildDokumentVyer } from "./dokument-view";
import type { SkolinspektionDokument } from "./skolregister";

function dokument(över: Partial<SkolinspektionDokument> = {}): SkolinspektionDokument {
  return {
    typ: "Skolenkäten (Ansvarig myndighet - Skolinspektionen)",
    typId: "SCHOOL_SURVEY",
    titel:
      "Gymnasieskola, Skolenkäten, Skolenhetsrapport, Göteborg, " +
      "Sigrid Rudebecks gymnasium, VT24 (pdf, 375 kB)",
    filnamn: "S_19207279.pdf",
    mimetyp: "application/pdf",
    storlekBytes: 384169,
    url: "https://example.test/doc",
    ...över,
  };
}

const vy = (d: SkolinspektionDokument) =>
  buildDokumentVyer([{ skolform: "Gymnasieskola", dokument: [d] }])[0]!.dokument[0]!;

describe("buildDokumentVyer", () => {
  test("shortens the type to a badge and drops the myndighet parenthesis", () => {
    expect(vy(dokument()).typ).toBe("Skolenkäten");
  });

  test("lifts the term out of the title and drops the repeated file size", () => {
    const d = vy(dokument());
    expect(d.period).toBe("VT24");
    expect(d.titel).toBe(
      "Gymnasieskola, Skolenkäten, Skolenhetsrapport, Göteborg, Sigrid Rudebecks gymnasium",
    );
    expect(d.storlek).toBe("375\u00A0kB");
  });

  test("a four-digit year is a term too", () => {
    const d = vy(
      dokument({
        typId: "THEMATIC_QUALITY_AUDIT",
        titel:
          "Tematisk kvalitetsgranskning, Granskningsbeslut Halmstad, " +
          "Östergårdsskolan 4-6, 2024 (pdf, 306 kB)",
      }),
    );
    expect(d.period).toBe("2024");
    expect(d.titel).toEndWith("Östergårdsskolan 4-6");
  });

  test("a title with no term keeps every word it has", () => {
    const d = vy(
      dokument({
        typId: "REGULAR_QUALITY_AUDIT",
        titel:
          "Regelb. kvalitetsgranskning, Grundskola, Uppföljning skolbeslut Kinda Horn skola (pdf, 741 kB)",
      }),
    );
    expect(d.period).toBeNull();
    expect(d.titel).toEndWith("Kinda Horn skola");
  });

  test("a number that is part of the name is not mistaken for a year", () => {
    const d = vy(
      dokument({
        typId: "REGULAR_QUALITY_AUDIT",
        titel: "Regelb. kvalitetsgranskning, Grundskola, Skolbeslut Kinda Horn skola 4-6",
      }),
    );
    expect(d.period).toBeNull();
    expect(d.titel).toEndWith("4-6");
  });

  test("only the myndighet's own findings are toned as something to look at", () => {
    expect(vy(dokument()).ton).toBe("ok");
    expect(vy(dokument({ typId: "REGULAR_SUPERVISION" })).ton).toBe("warn");
  });

  test("an unknown typId keeps the register's own label rather than dropping the document", () => {
    const d = vy(
      dokument({
        typId: "SOMETHING_NEW",
        typ: "Ny granskningsform (Ansvarig myndighet - Skolinspektionen)",
      }),
    );
    expect(d.typ).toBe("Ny granskningsform");
    expect(d.url).toBe("https://example.test/doc");
  });

  test("counts across every skolform group", () => {
    const grupper = buildDokumentVyer([
      { skolform: "Grundskola", dokument: [dokument(), dokument()] },
      { skolform: "Gymnasieskola", dokument: [dokument()] },
    ]);
    expect(antalDokument(grupper)).toBe(3);
  });
});

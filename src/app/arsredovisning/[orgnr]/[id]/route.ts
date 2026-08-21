import { formateraOrgnr, läsHandling, type Handlingsdel } from "@/lib/arsredovisning";

/**
 * Serves one document out of one Bolagsverket-package, straight from the zip
 * in `data/arsredovisningar/`. `?del=revision` picks the revisionsberättelse;
 * anything else is the årsredovisning itself.
 *
 * The packages are iXBRL: valid XHTML with the figures tagged inline, so a
 * browser renders the filing as filed. That also makes this third-party
 * markup served from our own origin, hence the CSP: `sandbox` drops it into
 * an opaque origin with scripting off, and the document's own inline CSS —
 * the only asset these filings carry — is all that is allowed through.
 */

const DELAR: Record<string, Handlingsdel> = {
  revision: "revisionsberattelse",
  revisionsberattelse: "revisionsberattelse",
};

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; sandbox";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgnr: string; id: string }> },
) {
  const { orgnr, id } = await params;
  const del =
    DELAR[new URL(request.url).searchParams.get("del") ?? ""] ?? "arsredovisning";

  const handling = await läsHandling(orgnr, id, del);
  if (!handling) return new Response("Handlingen finns inte", { status: 404 });

  const namn = `${del === "arsredovisning" ? "arsredovisning" : "revisionsberattelse"}-${formateraOrgnr(orgnr)}-${handling.räkenskapsårSlut}.xhtml`;

  return new Response(handling.xhtml, {
    headers: {
      "Content-Type": "application/xhtml+xml; charset=utf-8",
      "Content-Disposition": `inline; filename="${namn}"`,
      "Content-Security-Policy": CSP,
      // The packages are immutable once filed; a new filing is a new id.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

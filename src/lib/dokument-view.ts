import { bytes } from "./format";
import type { SkolinspektionDokument, SkolinspektionDokumentgrupp } from "./skolregister";

/**
 * Skolinspektionens documents, made readable.
 *
 * The register's own strings are written for a file listing, not for a page:
 * `typ` is "Regelbunden kvalitetsgranskning (Ansvarig myndighet -
 * Skolinspektionen)" and `titel` repeats the skolform, the kommun, the unit's
 * own name and the file size that sits in its own field two columns over —
 * "Gymnasieskola, Skolenkäten, Skolenhetsrapport, Göteborg, Sigrid Rudebecks
 * gymnasium, VT24 (pdf, 375 kB)".
 *
 * Nothing here invents a fact. It shortens the type to a badge, lifts the term
 * out of the title, and drops from the title only what the row already says
 * elsewhere.
 */

/** Whether a document is a finding to look at, or a routine publication. */
export type DokumentTon = "ok" | "warn";

interface DokumentTyp {
  kort: string;
  ton: DokumentTon;
}

/**
 * `typId` is the register's own stable key — five values across the whole
 * export — so the badge is keyed off that rather than off the display string.
 *
 * The tone is *not* a verdict on the school. `warn` marks the documents that
 * exist because the myndighet went looking at something specific; `ok` marks
 * the ones every unit gets. A beslut says what was examined and what is
 * required, not that the school is failing — which is what the note under the
 * list says in as many words.
 */
const TYPER: Record<string, DokumentTyp> = {
  SCHOOL_SURVEY: { kort: "Skolenkäten", ton: "ok" },
  REGULAR_SUPERVISION: { kort: "Regelbunden tillsyn", ton: "warn" },
  REGULAR_QUALITY_AUDIT: { kort: "Regelbunden kvalitetsgranskning", ton: "warn" },
  THEMATIC_QUALITY_AUDIT: { kort: "Tematisk kvalitetsgranskning", ton: "warn" },
  DECISION_THEMATIC_SUPERVISION: { kort: "Beslut, tematisk tillsyn", ton: "warn" },
};

export interface DokumentVy {
  key: string;
  typ: string;
  ton: DokumentTon;
  titel: string;
  /** "VT26", "2024" — the term the document covers, when the title names one. */
  period: string | null;
  storlek: string;
  url: string;
}

export interface DokumentgruppVy {
  skolform: string;
  dokument: DokumentVy[];
}

/** Trailing "(pdf, 375 kB)" — the row shows the format and the size already. */
const FILSUFFIX = /\s*\((?:pdf|docx?|xlsx?)[^)]*\)\s*$/i;
/** Trailing ", VT26" / " 2024" — lifted out and shown as its own column. */
const PERIOD = /[,\s]+((?:VT|HT)\d{2}|\d{4})$/i;

function städaTitel(titel: string): { titel: string; period: string | null } {
  const utanFil = titel.replace(FILSUFFIX, "").trim();
  const match = PERIOD.exec(utanFil);
  if (!match) return { titel: utanFil, period: null };
  return {
    titel: utanFil.slice(0, match.index).replace(/[,\s]+$/, ""),
    period: match[1].toUpperCase(),
  };
}

function dokumentVy(d: SkolinspektionDokument, key: string): DokumentVy {
  const typ = TYPER[d.typId];
  const { titel, period } = städaTitel(d.titel);
  return {
    key,
    // An unknown typId is a new document type at Skolinspektionen, not a bug:
    // fall back to the register's own label with the myndighet parenthesis
    // stripped, rather than dropping the document.
    typ: typ?.kort ?? d.typ.replace(/\s*\([^)]*\)\s*$/, "").trim(),
    ton: typ?.ton ?? "warn",
    titel,
    period,
    storlek: bytes(d.storlekBytes),
    url: d.url,
  };
}

export function buildDokumentVyer(
  grupper: SkolinspektionDokumentgrupp[],
): DokumentgruppVy[] {
  return grupper.map((grupp) => ({
    skolform: grupp.skolform,
    dokument: grupp.dokument.map((d, i) =>
      dokumentVy(d, `${grupp.skolform}-${d.typId}-${i}`),
    ),
  }));
}

export function antalDokument(grupper: DokumentgruppVy[]): number {
  return grupper.reduce((sum, g) => sum + g.dokument.length, 0);
}

/**
 * Reading Bolagsverkets package filenames, and saying what period a package
 * covers.
 *
 * The collector writes one directory per organisationsnummer under
 * `data/arsredovisningar/`, and inside it one package per filed
 * årsredovisning, named `<räkenskapsårets slutdatum>-<paket-id>_paket.zip`:
 *
 *     data/arsredovisningar/5560335837/2025-12-31-4f3ff71e-…-…_paket.zip
 *
 * The date is the only period information the filename carries — a package
 * says nothing here about when the räkenskapsår *started* — so the label is
 * derived from the end date alone and the exact date is shown beside it.
 */

/** `<YYYY-MM-DD>-<uuid>_paket.zip`, and nothing else. */
const PAKETNAMN =
  /^(\d{4}-\d{2}-\d{2})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_paket\.zip$/i;

export interface PaketNamn {
  /** The package id — also the filename of the årsredovisning inside the zip. */
  id: string;
  /** The räkenskapsår's last day, ISO. */
  räkenskapsårSlut: string;
}

export function parsePaketNamn(filnamn: string): PaketNamn | null {
  const match = PAKETNAMN.exec(filnamn);
  if (!match) return null;
  return { räkenskapsårSlut: match[1]!, id: match[2]!.toLowerCase() };
}

/**
 * "2025" for a räkenskapsår ending 31 December, "2024/25" for a brutet one.
 *
 * This assumes the twelve-month year that the overwhelming majority of these
 * bolag keep. A förlängt or förkortat räkenskapsår would be labelled as if it
 * were twelve months long — which is why the row prints the end date too,
 * where the filing itself is unambiguous.
 */
export function räkenskapsårEtikett(räkenskapsårSlut: string): string {
  const [år, månad] = räkenskapsårSlut.split("-");
  if (månad === "12") return år!;
  const föregående = Number(år) - 1;
  return `${föregående}/${år!.slice(2)}`;
}

/** `5560335837` → `556033-5837`, the way an organisationsnummer is written. */
export function formateraOrgnr(orgnr: string): string {
  return /^\d{10}$/.test(orgnr) ? `${orgnr.slice(0, 6)}-${orgnr.slice(6)}` : orgnr;
}

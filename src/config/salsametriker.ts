/**
 * SALSA — Skolverkets modell för att jämföra ett läsårs betygsresultat mot
 * vad elevsammansättningen (föräldrarnas utbildningsnivå, andel nyinvandrade,
 * andel pojkar) statistiskt förutsäger. `Deviation` är avvikelsen mellan det
 * faktiska resultatet och det förväntade — det är den, inte `Actual`, som är
 * SALSA:s egentliga poäng: en skola kan ha ett lågt meritvärde och ändå ligga
 * över förväntan, eller tvärtom.
 *
 * Ett sibling till `nyckeltalmetriker.ts`, men SALSA har ingen kommun- eller
 * riksjämförelse att slå mot — modellen *är* jämförelsen. `domain` är därför
 * centrerat på 0 (en avvikelse), inte skalan ett faktiskt värde rör sig på.
 */

export interface SalsaMetrik {
  /** Nyckel i `Salsa.matt` för avvikelsen. */
  deviationKey: string;
  /** Nyckel för det faktiska resultatet, visat som stöd åt avvikelsen. */
  actualKey: string;
  label: string;
  /** Vad `Actual` mäts i, för läsbarhetens skull ("meritvärdespoäng", "procentenheter"). */
  enhet: string;
  domain: [number, number];
  higherIsBetter: true;
}

export const salsametriker: SalsaMetrik[] = [
  {
    deviationKey: "salsaAverageGradesIn9thGradeDeviation",
    actualKey: "salsaAverageGradesIn9thGradeActual",
    label: "Meritvärde mot förväntat",
    enhet: "meritvärdespoäng",
    domain: [-30, 30],
    higherIsBetter: true,
  },
  {
    deviationKey: "salsaRequirementsReachedDeviation",
    actualKey: "salsaRequirementsReachedActual",
    label: "Godkänt i alla ämnen mot förväntat",
    enhet: "procentenheter",
    domain: [-20, 20],
    higherIsBetter: true,
  },
];

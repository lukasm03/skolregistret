import { Stat } from "skolregistret-ui";

export const Default = () => <Stat label="Elever" value="412" unit="st" />;

export const WithNote = () => (
  <Stat label="Meritvärde" value="228,4" note="Snitt åk 9, 17 elever" />
);

export const Word = () => <Stat label="Huvudmannatyp" value="Fristående" sans />;

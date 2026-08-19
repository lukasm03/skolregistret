import { Stat, StatGrid } from "skolregistret-ui";

export const Default = () => (
  <StatGrid>
    <Stat label="Elever" value="412" unit="st" />
    <Stat label="Lärartäthet" value="9,8" unit="elever/lärare" />
    <Stat label="Meritvärde" value="228,4" />
    <Stat label="Behöriga lärare" value="87" unit="%" />
  </StatGrid>
);

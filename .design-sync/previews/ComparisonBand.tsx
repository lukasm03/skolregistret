import { ComparisonBand } from "skolregistret-ui";

export const Over = () => (
  <div className="w-[280px]">
    <ComparisonBand egenPct={72} kommunPct={58} riksPct={54} riktning="over" />
  </div>
);

export const Under = () => (
  <div className="w-[280px]">
    <ComparisonBand egenPct={31} kommunPct={52} riksPct={49} riktning="under" />
  </div>
);

export const Level = () => (
  <div className="w-[280px]">
    <ComparisonBand egenPct={50} kommunPct={51} riksPct={48} riktning="level" />
  </div>
);

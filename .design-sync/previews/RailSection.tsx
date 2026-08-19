import { FactList, RailSection } from "skolregistret-ui";

export const Default = () => (
  <RailSection title="Om skolan">
    <FactList
      items={[
        ["Kommun", "Uppsala"],
        ["Skolform", "Grundskola"],
      ]}
    />
  </RailSection>
);

export const Undivided = () => (
  <RailSection title="Om skolan" divided={false}>
    <FactList items={[["Kommun", "Uppsala"]]} />
  </RailSection>
);

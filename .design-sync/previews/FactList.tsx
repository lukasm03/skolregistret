import { FactList } from "skolregistret-ui";

export const Default = () => (
  <FactList
    items={[
      ["Kommun", "Uppsala"],
      ["Huvudman", "Uppsala kommun"],
      ["Skolform", "Grundskola"],
      ["Antal elever", "412"],
    ]}
  />
);

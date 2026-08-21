import { FilterSummary } from "skolregistret-ui";

export const Default = () => (
  <FilterSummary
    filters={[
      { key: "kommun", label: "Kommun", value: "Uppsala", clear: { kommun: null } },
      {
        key: "skolform",
        label: "Skolform",
        value: "Grundskola",
        clear: { skolform: null },
      },
    ]}
    onClear={() => {}}
    onClearAll={() => {}}
  />
);

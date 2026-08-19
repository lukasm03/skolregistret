import { NoMatches } from "skolregistret-ui";

export const WithFilters = () => (
  <NoMatches
    message="Inga skolenheter matchar filtren."
    filters={[
      { key: "kommun", label: "Kommun", value: "Uppsala", clear: { kommun: null } },
    ]}
    onClearAll={() => {}}
  />
);

export const NoFilters = () => (
  <NoMatches message="Inga skolenheter hittades." filters={[]} onClearAll={() => {}} />
);

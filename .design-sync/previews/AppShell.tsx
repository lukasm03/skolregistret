import { useState } from "react";
import { AppShell } from "skolregistret-ui";

export const Skolor = () => (
  <AppShell section="/skolor" searchPlaceholder="Sök skolenhetsnamn" searchAction="/skolor">
    <div className="p-6 text-sm text-ink-muted">Innehåll för /skolor.</div>
  </AppShell>
);

export const InteractiveSearch = () => {
  const [value, setValue] = useState("Uppsala");
  return (
    <AppShell
      section="/huvudman"
      searchPlaceholder="Sök huvudman eller org.nr"
      searchAction="/huvudman"
      searchValue={value}
      onSearchChange={setValue}
    >
      <div className="p-6 text-sm text-ink-muted">Innehåll för /huvudman.</div>
    </AppShell>
  );
};

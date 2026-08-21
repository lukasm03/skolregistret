import { useState } from "react";
import { CheckboxControl, FilterGroup, Sidebar, SidebarFootnote } from "skolregistret-ui";

export const Default = () => {
  const [checked, setChecked] = useState<Record<string, boolean>>({ gr: true });
  const options = [
    { key: "gr", label: "Grundskola", count: 4821 },
    { key: "gy", label: "Gymnasieskola", count: 1203 },
  ];
  return (
    <Sidebar activeCount={1}>
      <FilterGroup label="Skolform">
        <div className="flex flex-col gap-[7px]">
          {options.map((o) => (
            <CheckboxControl
              key={o.key}
              label={o.label}
              count={o.count}
              checked={!!checked[o.key]}
              onToggle={() => setChecked((c) => ({ ...c, [o.key]: !c[o.key] }))}
            />
          ))}
        </div>
      </FilterGroup>
      <SidebarFootnote>Antalen uppdateras varje natt.</SidebarFootnote>
    </Sidebar>
  );
};

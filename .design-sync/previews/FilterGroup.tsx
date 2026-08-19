import { useState } from "react";
import { CheckboxControl, FilterGroup } from "skolregistret-ui";

export const Default = () => {
  const [checked, setChecked] = useState<Record<string, boolean>>({ uppsala: true });
  const options = [
    { key: "uppsala", label: "Uppsala", count: 128 },
    { key: "stockholm", label: "Stockholm", count: 412 },
    { key: "goteborg", label: "Göteborg", count: 96 },
  ];
  return (
    <FilterGroup label="Kommun">
      <div className="flex flex-col gap-[7px]">
        {options.map((o) => (
          <CheckboxControl
            key={o.key}
            label={o.label}
            count={o.count}
            checked={!!checked[o.key]}
            onToggle={() =>
              setChecked((c) => ({ ...c, [o.key]: !c[o.key] }))
            }
          />
        ))}
      </div>
    </FilterGroup>
  );
};

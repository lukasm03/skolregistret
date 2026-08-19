import { useState } from "react";
import { RadioControl } from "skolregistret-ui";

export const Group = () => {
  const [selected, setSelected] = useState("gr");
  const options = [
    { value: "gr", label: "Grundskola", count: 4821 },
    { value: "gy", label: "Gymnasieskola", count: 1203 },
    { value: "fsk", label: "Förskoleklass", count: 3990 },
  ];
  return (
    <div className="flex flex-col gap-[7px]">
      {options.map((o) => (
        <RadioControl
          key={o.value}
          name="skolform"
          label={o.label}
          count={o.count}
          checked={selected === o.value}
          onSelect={() => setSelected(o.value)}
        />
      ))}
    </div>
  );
};

import { useState } from "react";
import { Chip } from "skolregistret-ui";

export const Group = () => {
  const [active, setActive] = useState("NA");
  const programs = ["NA", "SA", "EK", "TE", "ES"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {programs.map((p) => (
        <Chip key={p} active={active === p} onToggle={() => setActive(p)}>
          {p}
        </Chip>
      ))}
    </div>
  );
};

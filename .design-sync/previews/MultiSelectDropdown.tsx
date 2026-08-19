import { useEffect, useRef, useState } from "react";
import { MultiSelectDropdown } from "skolregistret-ui";

const programs = [
  { value: "NA", label: "Naturvetenskapsprogrammet", count: 44 },
  { value: "SA", label: "Samhällsvetenskapsprogrammet", count: 61 },
  { value: "EK", label: "Ekonomiprogrammet", count: 38 },
  { value: "TE", label: "Teknikprogrammet", count: 29 },
  { value: "ES", label: "Estetiska programmet", count: 17 },
];

function Demo({ openOnMount, initial }: { openOnMount?: boolean; initial: string[] }) {
  const [selected, setSelected] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openOnMount) ref.current?.querySelector("button")?.click();
  }, [openOnMount]);
  return (
    <div ref={ref}>
      <MultiSelectDropdown
        label="Gymnasieprogram"
        placeholder="Alla program"
        selected={selected}
        options={programs}
        onToggle={(v) =>
          setSelected((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))
        }
      />
    </div>
  );
}

export const Closed = () => <Demo initial={["NA", "SA"]} />;

export const Open = () => <Demo initial={["NA"]} openOnMount />;

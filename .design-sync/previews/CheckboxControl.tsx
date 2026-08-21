import { useState } from "react";
import { CheckboxControl } from "skolregistret-ui";

function Row({
  label,
  count,
  initial,
}: {
  label: string;
  count?: number;
  initial: boolean;
}) {
  const [checked, setChecked] = useState(initial);
  return (
    <CheckboxControl
      label={label}
      count={count}
      checked={checked}
      onToggle={() => setChecked((c) => !c)}
    />
  );
}

export const Checked = () => <Row label="Fristående" count={214} initial />;

export const Unchecked = () => <Row label="Kommunal" count={891} initial={false} />;

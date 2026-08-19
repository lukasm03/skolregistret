import { useState } from "react";
import { RangeField } from "skolregistret-ui";

export const Default = () => {
  const [min, setMin] = useState<number | undefined>(50);
  const [max, setMax] = useState<number | undefined>(500);
  return (
    <RangeField
      min={min}
      max={max}
      placeholderMin={0}
      placeholderMax={1000}
      onChange={(bound, value) => {
        const n = value === "" ? undefined : Number(value);
        if (bound === "min") setMin(n);
        else setMax(n);
      }}
    />
  );
};

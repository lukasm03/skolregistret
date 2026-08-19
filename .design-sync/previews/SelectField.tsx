import { useState } from "react";
import { SelectField } from "skolregistret-ui";

export const Default = () => {
  const [value, setValue] = useState("uppsala");
  return (
    <SelectField
      name="kommun"
      label="Kommun"
      allLabel="Alla kommuner"
      value={value}
      onChange={setValue}
      options={[
        { value: "uppsala", label: "Uppsala", count: 128 },
        { value: "stockholm", label: "Stockholm", count: 412 },
        { value: "goteborg", label: "Göteborg", count: 96 },
      ]}
    />
  );
};

import { useState } from "react";
import { Toggle } from "skolregistret-ui";

function Row({ label, initial }: { label: string; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return <Toggle label={label} on={on} onToggle={() => setOn((v) => !v)} />;
}

export const On = () => <Row label="Endast koncerner" initial />;

export const Off = () => <Row label="Endast koncerner" initial={false} />;

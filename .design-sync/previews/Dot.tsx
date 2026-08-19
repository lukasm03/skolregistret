import { Dot } from "skolregistret-ui";

export const InContext = () => (
  <span className="flex items-center gap-1.5 text-sm text-ink-muted">
    <span>Uppsala kommun</span>
    <Dot />
    <span>Fristående</span>
    <Dot />
    <span>412 elever</span>
  </span>
);

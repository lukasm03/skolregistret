import { SortArrow } from "skolregistret-ui";

export const Unsorted = () => (
  <span className="flex items-center text-ink-faint">
    <SortArrow size={20} dir={null} />
  </span>
);

export const Ascending = () => (
  <span className="flex items-center text-ink">
    <SortArrow size={20} dir="asc" />
  </span>
);

export const Descending = () => (
  <span className="flex items-center text-ink">
    <SortArrow size={20} dir="desc" />
  </span>
);

// The design-sync UI kit barrel. This repo (skolregistret) is a Next.js app,
// not a library — this file exists so /design-sync has a real `dist/` +
// `.d.ts` to build from. Every export below is the app's actual component,
// re-exported unmodified; nothing here reimplements anything.
export {
  Label,
  SectionTitle,
  Stat,
  StatFacts,
  MetaField,
  StatGrid,
  StatusPill,
  KoncernPill,
  Dot,
  FactList,
  RailSection,
  Note,
  EmptyBox,
  ButtonLink,
  BackLink,
} from "../../src/components/ui/primitives";

export {
  FilterGroup,
  CheckboxControl,
  RadioControl,
  Chip,
  Toggle,
  SelectField,
  RangeField,
  MultiSelectDropdown,
  SidebarFootnote,
  Sidebar,
} from "../../src/components/filters/controls";

export {
  CaretRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Close,
  SortArrow,
} from "../../src/components/ui/icons";

export {
  ListToolbar,
  FilterSummary,
  NoMatches,
  ListFooter,
  Pagination,
  PerPageControl,
} from "../../src/components/list/ListChrome";

export { DataTable, TableScroller, type Column } from "../../src/components/ui/DataTable";

export { DataGrid } from "../../src/components/ui/DataGrid";

export { Tabs, type TabDef, type TabView } from "../../src/components/ui/Tabs";

export { ComparisonBand, BandLegend } from "../../src/components/detail/ComparisonBand";

export { AppShell } from "../../src/components/layout/AppShell";

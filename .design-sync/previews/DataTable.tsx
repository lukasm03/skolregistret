import { DataTable, type Column } from "skolregistret-ui";

interface Skola {
  namn: string;
  kommun: string;
  elever: number;
  meritvarde: number;
}

const rows: Skola[] = [
  { namn: "Uppsala Norra skolan", kommun: "Uppsala", elever: 412, meritvarde: 228.4 },
  { namn: "Fyrisskolan", kommun: "Uppsala", elever: 356, meritvarde: 215.1 },
  { namn: "Gottsunda skola", kommun: "Uppsala", elever: 298, meritvarde: 198.7 },
  { namn: "Björkvallsskolan", kommun: "Uppsala", elever: 501, meritvarde: 233.9 },
];

const columns: Column<Skola>[] = [
  { key: "namn", header: "Skolenhet", strong: true, cell: (r) => r.namn },
  { key: "kommun", header: "Kommun", muted: true, cell: (r) => r.kommun },
  {
    key: "elever",
    header: "Elever",
    align: "right",
    mono: true,
    width: 90,
    cell: (r) => r.elever,
  },
  {
    key: "meritvarde",
    header: "Meritvärde",
    align: "right",
    mono: true,
    width: 110,
    cell: (r) => r.meritvarde.toFixed(1).replace(".", ","),
  },
];

export const Default = () => (
  <DataTable
    columns={columns}
    rows={rows}
    rowKey={(r) => r.namn}
    rowHref={(r) => `/skolor/${encodeURIComponent(r.namn)}`}
    label="Skolenheter"
  />
);

export const Empty = () => (
  <DataTable columns={columns} rows={[]} rowKey={(r) => r.namn} label="Skolenheter" />
);

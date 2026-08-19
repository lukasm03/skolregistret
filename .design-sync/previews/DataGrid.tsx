import { useState } from "react";
import { DataGrid, type Column } from "skolregistret-ui";

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
  { namn: "Sävja skola", kommun: "Uppsala", elever: 187, meritvarde: 204.2 },
];

const columns: Column<Skola>[] = [
  { key: "namn", header: "Skolenhet", strong: true, cell: (r) => r.namn, sortValue: (r) => r.namn },
  { key: "kommun", header: "Kommun", muted: true, cell: (r) => r.kommun, sortValue: (r) => r.kommun },
  {
    key: "elever",
    header: "Elever",
    align: "right",
    mono: true,
    width: 90,
    cell: (r) => r.elever,
    sortValue: (r) => r.elever,
    descFirst: true,
  },
  {
    key: "meritvarde",
    header: "Meritvärde",
    align: "right",
    mono: true,
    width: 110,
    cell: (r) => r.meritvarde.toFixed(1).replace(".", ","),
    sortValue: (r) => r.meritvarde,
    descFirst: true,
  },
];

export const Default = () => {
  const [sort, setSort] = useState({ id: "elever", desc: true });
  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(r) => r.namn}
      rowHref={(r) => `/skolor/${encodeURIComponent(r.namn)}`}
      label="Skolenheter"
      sort={sort}
      onSortChange={setSort}
      pageIndex={0}
      pageSize={10}
      onPageChange={() => {}}
    />
  );
};

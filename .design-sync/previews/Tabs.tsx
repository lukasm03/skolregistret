import { Tabs, type TabDef } from "skolregistret-ui";

const tabs: TabDef[] = [
  {
    id: "nyckeltal",
    label: "Nyckeltal",
    count: 4,
    views: [
      {
        id: "kort",
        label: "Kort",
        hint: "Ett kort per mått",
        content: <p className="p-4 text-sm text-ink-muted">Nyckeltal som kort.</p>,
      },
      {
        id: "tabell",
        label: "Tabell",
        hint: "Alla mått i en tabell",
        content: <p className="p-4 text-sm text-ink-muted">Nyckeltal som tabell.</p>,
      },
    ],
  },
  {
    id: "enkat",
    label: "Skolenkät",
    count: 12,
    views: [
      {
        id: "kort",
        label: "Kort",
        hint: "Ett kort per fråga",
        content: <p className="p-4 text-sm text-ink-muted">Enkätsvar som kort.</p>,
      },
    ],
  },
  {
    id: "dokument",
    label: "Dokument",
    views: [
      {
        id: "lista",
        label: "Lista",
        hint: "Dokumentlista",
        content: <p className="p-4 text-sm text-ink-muted">Dokument i listform.</p>,
      },
    ],
  },
];

export const Default = () => <Tabs tabs={tabs} defaultTab="nyckeltal" />;

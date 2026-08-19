import type { TrädNod } from "@/lib/skolregister";

/**
 * The koncern's real ownership tree, rebuilt from Dun & Bradstreet's flat
 * `trad.noder` via `buildTrädFrånNoder` (see `lib/skolregister/koncern.ts`).
 * A company can have several children, so this nests by depth rather than
 * drawing the single-chain list `kedja` used to be.
 */
export function KoncernTree({ träd }: { träd: TrädNod[] }) {
  return (
    <ul className="flex flex-col gap-1.5 rounded-lg border border-line-soft bg-surface-panel p-4">
      {träd.map((nod) => (
        <KoncernTreeNode key={nod.orgnr} nod={nod} depth={0} />
      ))}
    </ul>
  );
}

const STATUS_LABEL: Record<string, string> = {
  aktiv: "",
  avregistrerad: "Avregistrerat",
  okand: "Utländskt/ej i svenskt register",
  fel: "Uppgift saknas",
};

function KoncernTreeNode({ nod, depth }: { nod: TrädNod; depth: number }) {
  const statusLabel = nod.bolagsstatus ? STATUS_LABEL[nod.bolagsstatus] : "";
  return (
    <li className="flex flex-col gap-1">
      <div
        className="flex items-center gap-1.5 text-sm text-ink"
        style={{ paddingLeft: depth * 18 }}
      >
        {depth > 0 && (
          <span
            aria-hidden
            className="mr-1 h-[9px] w-[7px] flex-none rounded-bl-xs border-b border-l border-line-control"
          />
        )}
        <span className="min-w-0 truncate">{nod.namn ?? nod.orgnr}</span>
        {nod.land && nod.land !== "SE" && (
          <span className="flex-none text-xs text-ink-faint">({nod.land})</span>
        )}
        {statusLabel && (
          <span className="flex-none rounded-md border border-line-softer bg-surface-subtle px-1.5 py-[1px] text-micro text-ink-muted">
            {statusLabel}
          </span>
        )}
      </div>
      {nod.barn.length > 0 && (
        <ul className="flex flex-col gap-1">
          {nod.barn.map((barn) => (
            <KoncernTreeNode key={barn.orgnr} nod={barn} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

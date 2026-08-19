import { TableScroller } from "skolregistret-ui";

export const Default = () => (
  <TableScroller minWidth={900} label="Skolenheter">
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr className="bg-surface-head">
          <th className="h-[30px] w-[400px] border-b border-line px-2 text-left text-micro font-semibold tracking-[0.07em] text-ink-subtle uppercase">
            Skolenhet
          </th>
          <th className="h-[30px] w-[200px] border-b border-line px-2 text-left text-micro font-semibold tracking-[0.07em] text-ink-subtle uppercase">
            Kommun
          </th>
          <th className="h-[30px] w-[150px] border-b border-line px-2 text-right text-micro font-semibold tracking-[0.07em] text-ink-subtle uppercase">
            Elever
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-b border-line-row" style={{ height: 34 }}>
          <td className="px-2 text-base font-medium">Uppsala Norra skolan</td>
          <td className="px-2 text-base text-ink-muted">Uppsala</td>
          <td className="px-2 text-right font-mono text-sm">412</td>
        </tr>
      </tbody>
    </table>
  </TableScroller>
);

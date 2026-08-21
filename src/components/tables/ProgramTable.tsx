"use client";

import { useId, useMemo, useState } from "react";
import { TableScroller, headerClass } from "@/components/ui/DataTable";
import { CaretRight, SortArrow } from "@/components/ui/icons";
import { barTone, valueTone } from "@/components/detail/tone";
import { programgrupper, programmetriker } from "@/config/programmetriker";
import { DASH, signed } from "@/lib/format";
import {
  nextProgramSort,
  sortProgramComparisons,
  type ProgramComparison,
  type ProgramMetricCell,
  type ProgramSort,
} from "@/lib/program-compare";

/**
 * The gymnasieprogram table. One row per programme, riket carried as colour on
 * the figure and as an exact difference beneath it, with the national value
 * and a deviation bar a click away.
 *
 * It replaces a table that rendered every programme twice — its own figures,
 * then an indented "Riksgenomsnitt" line — and left the subtraction to the
 * reader.
 *
 * Six columns of figures read as one wall, so they sit under three spanning
 * headers — how big the programme is, what it took to get in, what came out.
 * The grouping is declared in `programmetriker.ts`, not here.
 *
 * Client-side because sorting and the open row are local state that no URL
 * needs to carry: unlike the list filters, nothing here is worth sharing a
 * link to, and the detail pages are otherwise static.
 */

/** A rule between header groups, on the first column of each. */
const GROUP_RULE = "border-l border-line-row";

export function ProgramTable({ rows }: { rows: ProgramComparison[] }) {
  const [sort, setSort] = useState<ProgramSort>(null);
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();

  const sorted = useMemo(() => sortProgramComparisons(rows, sort), [rows, sort]);

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
        <p className="text-xs text-ink-subtle">
          {sort
            ? `Sorterat efter ${(
                programmetriker.find((m) => m.key === sort.key)?.label ?? ""
              ).toLowerCase()}, ${sort.dir === "desc" ? "högst" : "lägst"} först`
            : "Sorterat efter hur programmet ligger mot riket"}
        </p>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-[8px] rounded-full bg-under" />
            under riket
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-[8px] rounded-full bg-over" />
            över riket
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-[8px] rounded-full bg-ink-faint" />
            utan riktning
          </span>
        </div>
      </div>

      <TableScroller minWidth={280 + programmetriker.length * 112 + 24} label="Program">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="bg-surface-head">
              <td className="border-b border-line-row" />
              {programgrupper.map((g, i) => (
                <th
                  key={g.grupp}
                  scope="colgroup"
                  colSpan={g.span}
                  className={`border-b border-line-row px-2 pt-[7px] pb-1 text-center text-micro font-semibold tracking-[0.07em] text-ink-faint uppercase ${
                    i > 0 ? GROUP_RULE : ""
                  }`}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            <tr className="bg-surface-head">
              <th
                scope="col"
                style={{ width: 280 }}
                className={`${headerClass} text-left`}
              >
                Program
              </th>
              {programmetriker.map((m, i) => {
                const active = sort?.key === m.key;
                return (
                  <th
                    key={m.key}
                    scope="col"
                    aria-sort={
                      active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"
                    }
                    className={`${headerClass} text-center ${
                      m.grupp !== programmetriker[i - 1]?.grupp && i > 0 ? GROUP_RULE : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSort(nextProgramSort(sort, m.key))}
                      // The header is abbreviated to fit the column, so the
                      // hint is the only place the measure is spelled out.
                      // `title` shows it to a mouse; the description carries
                      // it to a keyboard and a screen reader, which a
                      // tooltip never reaches.
                      title={m.hint}
                      aria-describedby={`${baseId}-hint-${m.key}`}
                      className={`flex w-full items-center justify-center gap-1 uppercase hover:text-ink ${
                        active ? "text-ink" : ""
                      }`}
                    >
                      {m.short}
                      <SortArrow
                        size={11}
                        dir={active ? sort.dir : null}
                        className={active ? "text-ink" : "text-ink-faint"}
                      />
                    </button>
                    {/* Outside the button on purpose: text inside it would
                        join the button's own name rather than describe it. */}
                    <span id={`${baseId}-hint-${m.key}`} className="sr-only">
                      {m.hint}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sorted.map((row) => {
              const isOpen = open === row.kod;
              return (
                <ProgramRows
                  key={row.kod}
                  row={row}
                  isOpen={isOpen}
                  detailId={`${baseId}-${row.kod}`}
                  onToggle={() => setOpen(isOpen ? null : row.kod)}
                />
              );
            })}
          </tbody>
        </table>
      </TableScroller>

      <p className="text-xs leading-[1.55] text-ink-faint">
        Jämförelsen sker mot samma program i hela riket, inte mot skolans övriga program.
        Öppna en rad för avvikelser och riksvärden.
      </p>
    </section>
  );
}

function ProgramRows({
  row,
  isOpen,
  detailId,
  onToggle,
}: {
  row: ProgramComparison;
  isOpen: boolean;
  detailId: string;
  onToggle: () => void;
}) {
  // The sticky name cell needs the row's own background under it, or the
  // figures scroll through it.
  const rowBg = isOpen ? "bg-surface-subtle" : "bg-surface";

  return (
    <>
      <tr
        className={`group border-b border-line-row ${
          isOpen ? "bg-surface-subtle" : "hover:bg-row-hover"
        }`}
      >
        {/*
          The name column stays put while the figures scroll under it, which
          means it paints its own background — including the row's hover, or
          it would be the one cell that does not light up.
        */}
        <td
          className={`sticky left-0 z-10 px-2 py-2 align-middle ${rowBg} ${
            isOpen ? "" : "group-hover:bg-row-hover"
          }`}
        >
          <button
            type="button"
            // The one control for the row — the thing that announces itself
            // and that both mouse and keyboard reach.
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-controls={detailId}
            className="flex min-h-[24px] w-full items-center gap-2.5 text-left"
          >
            <CaretRight
              size={11}
              className={`text-ink-faint transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
            <span className="min-w-0 flex-1 truncate text-md font-medium">
              {row.namn}
            </span>
          </button>
        </td>

        {row.cells.map((cell) => (
          <td
            key={cell.metrik.key}
            className={`px-2 py-2 text-center align-middle ${cell.nyGrupp ? GROUP_RULE : ""}`}
          >
            {cell.tal == null ? (
              <span className="font-mono text-lg text-ink-ghost">{DASH}</span>
            ) : (
              <>
                <div className={`font-mono text-lg ${valueTone[cell.riktning]}`}>
                  {cell.text}
                </div>
                {/*
                  The design carries above/below as colour alone. The figure it
                  stands on belongs on the surface too — colour is not the only
                  reader, and the difference is the thing a person came for.
                  Only where a direction exists: "+64 elever against riket" is
                  a fact about size, not about quality.
                */}
                {cell.riktning !== "none" && cell.diff != null && (
                  <div className={`font-mono text-micro ${valueTone[cell.riktning]}`}>
                    {signed(cell.diff)}
                  </div>
                )}
              </>
            )}
          </td>
        ))}
      </tr>

      {isOpen && (
        <tr className="border-b border-line-row bg-surface-subtle">
          {/*
            The caret takes 150ms to turn; without this the thing it points at
            was already there before it finished. A staged, once-only entrance
            is what keyframes are for, and the reduced-motion guard in
            globals.css stops it for anyone who asked.
          */}
          <td
            id={detailId}
            colSpan={row.cells.length + 1}
            className="animate-[reveal_150ms_ease-out] px-2 pb-4"
          >
            <p className="mt-1.5 mb-2.5 max-w-[70ch] pl-[30px] text-base leading-[1.5]">
              {row.sammanfattning}
            </p>
            <div className="grid gap-x-10 gap-y-0.5 pl-[30px] md:grid-cols-2">
              {row.cells.map((cell) => (
                <ProgramDeviation key={cell.metrik.key} cell={cell} />
              ))}
            </div>
            <p className="mt-3 pl-[30px] text-xs leading-[1.5] text-ink-faint">
              Mittlinjen är riksgenomsnittet för samma program. Elever och lägsta poäng
              färgas neutralt — högre är varken bra eller dåligt.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

/** One measure inside an open row: name, deviation bar, riket, difference. */
function ProgramDeviation({ cell }: { cell: ProgramMetricCell }) {
  const width = cell.t != null ? Math.abs(cell.t) * 50 : 0;

  return (
    <div className="grid grid-cols-[minmax(96px,132px)_1fr_auto] items-center gap-3 border-b border-line-row py-[7px]">
      <span className="text-sm text-ink-muted">{cell.metrik.label}</span>

      <span aria-hidden className="relative h-[12px]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
        {cell.t != null && width > 0 && (
          <span
            className={`absolute top-[4px] h-[4px] rounded-xs ${barTone[cell.riktning]}`}
            style={
              cell.t >= 0
                ? { left: "50%", width: `${width}%` }
                : { right: "50%", width: `${width}%` }
            }
          />
        )}
      </span>

      <span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
        <span className="font-mono text-mono text-ink-faint">
          riket {cell.riksText ?? DASH}
        </span>
        <span className={`font-mono text-sm ${valueTone[cell.riktning]}`}>
          {signed(cell.diff)}
        </span>
      </span>
    </div>
  );
}

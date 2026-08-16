"use client";

import { useId, useMemo, useState } from "react";
import { SectionTitle } from "@/components/ui/primitives";
import { TableScroller, headerClass } from "@/components/ui/DataTable";
import { programmetriker } from "@/config/programmetriker";
import { DASH, signed } from "@/lib/format";
import {
  nextProgramSort,
  sortProgramComparisons,
  type ProgramComparison,
  type ProgramMetricCell,
  type ProgramSort,
} from "@/lib/program-compare";

/**
 * The gymnasieprogram table. One row per programme, riket carried as colour
 * on the figure and as an exact difference beneath it, with the national
 * value and a deviation bar a click away.
 *
 * It replaces a table that rendered every programme twice — its own figures,
 * then an indented "Riksgenomsnitt" line — and left the subtraction to the
 * reader.
 *
 * Client-side because sorting and the open row are local state that no URL
 * needs to carry: unlike the list filters, nothing here is worth sharing a
 * link to, and the detail pages are otherwise static.
 */

/** Below this the figure reads as level with riket — it rounds to ±0 anyway. */
const LEVEL = 0.05;

type Direction = "over" | "under" | "level" | "none";

/**
 * Which way a figure sits against riket, and whether that means anything.
 * A measure with no better direction — elevantal, lägsta poäng — never
 * answers "over" or "under": a big programme is not a good one.
 */
function direction(cell: ProgramMetricCell): Direction {
  if (cell.metrik.higherIsBetter !== true || cell.diff == null) return "none";
  if (cell.diff > LEVEL) return "over";
  if (cell.diff < -LEVEL) return "under";
  return "level";
}

const VALUE_COLOUR: Record<Direction, string> = {
  over: "text-over",
  under: "text-under",
  level: "text-ink-muted",
  none: "text-ink",
};

export function ProgramTable({ rows }: { rows: ProgramComparison[] }) {
  const [sort, setSort] = useState<ProgramSort>(null);
  const [open, setOpen] = useState<string | null>(null);
  const baseId = useId();

  const sorted = useMemo(() => sortProgramComparisons(rows, sort), [rows, sort]);

  const sortLabel = sort
    ? `Sorterat efter ${(
        programmetriker.find((m) => m.key === sort.key)?.label ?? ""
      ).toLowerCase()}, ${sort.dir === "desc" ? "högst" : "lägst"} först`
    : "Sorterat efter hur programmet ligger mot riket";

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2">
        <SectionTitle note={sortLabel}>Program</SectionTitle>
        <div className="flex items-center gap-3.5 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-[8px] rounded-full bg-under" />
            under riket
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-[8px] rounded-full bg-over" />
            över riket
          </span>
        </div>
      </div>

      <TableScroller minWidth={300 + programmetriker.length * 108 + 24} label="Program">
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="bg-surface-head">
              <th
                scope="col"
                style={{ width: 300 }}
                className={`${headerClass} text-left`}
              >
                Program
              </th>
              {programmetriker.map((m) => {
                const active = sort?.key === m.key;
                return (
                  <th
                    key={m.key}
                    scope="col"
                    aria-sort={
                      active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"
                    }
                    className={`${headerClass} text-center`}
                  >
                    <button
                      type="button"
                      onClick={() => setSort(nextProgramSort(sort, m.key))}
                      className={`flex w-full items-center justify-center gap-1 uppercase hover:text-ink ${
                        active ? "text-ink" : ""
                      }`}
                    >
                      {m.short}
                      <span
                        aria-hidden
                        className={`text-[10px] ${active ? "text-ink" : "text-ink-faint"}`}
                      >
                        {active ? (sort.dir === "desc" ? "▾" : "▴") : "⇅"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sorted.map((row) => {
              const isOpen = open === row.kod;
              const detailId = `${baseId}-${row.kod}`;
              // The sticky name cell needs the row's own background under it,
              // or the figures scroll through it.
              const rowBg = isOpen ? "bg-surface-subtle" : "bg-surface";

              return (
                <ProgramRows
                  key={row.kod}
                  row={row}
                  isOpen={isOpen}
                  detailId={detailId}
                  rowBg={rowBg}
                  onToggle={() => setOpen(isOpen ? null : row.kod)}
                />
              );
            })}
          </tbody>
        </table>
      </TableScroller>
    </section>
  );
}

function ProgramRows({
  row,
  isOpen,
  detailId,
  rowBg,
  onToggle,
}: {
  row: ProgramComparison;
  isOpen: boolean;
  detailId: string;
  rowBg: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`group cursor-pointer border-b border-line-row ${
          isOpen ? "bg-surface-subtle" : "hover:bg-row-hover"
        }`}
      >
        {/*
          The name column stays put while the figures scroll under it, which
          means it paints its own background — including the row's hover, or
          it would be the one cell that does not light up.
        */}
        <td
          className={`sticky left-0 px-2 py-2 align-middle ${rowBg} ${
            isOpen ? "" : "group-hover:bg-row-hover"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              // The row toggles too, for the mouse; this is the control that
              // announces itself and that a keyboard reaches.
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              aria-expanded={isOpen}
              aria-controls={detailId}
              className="flex min-h-[24px] min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span
                aria-hidden
                className={`w-[10px] flex-none text-[9px] text-ink-faint transition-transform ${
                  isOpen ? "rotate-90" : ""
                }`}
              >
                ▶
              </span>
              <span className="min-w-0 flex-1 truncate text-md font-medium">
                {row.namn}
              </span>
            </button>
            <span className="flex-none font-mono text-mono text-ink-faint">
              {row.elever} elever
            </span>
          </div>
        </td>

        {row.cells.map((cell) => {
          const dir = direction(cell);
          return (
            <td key={cell.metrik.key} className="px-2 py-2 text-center align-middle">
              {cell.tal == null ? (
                <span className="font-mono text-lg text-ink-ghost">{DASH}</span>
              ) : (
                <>
                  <div className={`font-mono text-lg ${VALUE_COLOUR[dir]}`}>
                    {cell.text}
                  </div>
                  {/*
                    The design carries above/below as colour alone. The figure
                    it stands on belongs on the surface too — colour is not
                    the only reader, and the difference is the thing a person
                    came for. Only where a direction exists: "+64 elever
                    against riket" is a fact about size, not about quality.
                  */}
                  {dir !== "none" && cell.diff != null && (
                    <div className={`font-mono text-micro ${VALUE_COLOUR[dir]}`}>
                      {signed(cell.diff)}
                    </div>
                  )}
                </>
              )}
            </td>
          );
        })}
      </tr>

      {isOpen && (
        <tr className="border-b border-line-row bg-surface-subtle">
          <td id={detailId} colSpan={row.cells.length + 1} className="px-2 pb-4">
            <div className="grid gap-x-10 gap-y-0.5 pl-[30px] md:grid-cols-2">
              {row.cells.map((cell) => (
                <ProgramDeviation key={cell.metrik.key} cell={cell} />
              ))}
            </div>
            <p className="mt-3 pl-[30px] text-xs leading-[1.5] text-ink-faint">
              Mittlinjen är riksgenomsnittet. Elever och lägsta poäng färgas neutralt —
              högre är varken bra eller dåligt.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

/** One measure inside an open row: name, deviation bar, riket, difference. */
function ProgramDeviation({ cell }: { cell: ProgramMetricCell }) {
  const dir = direction(cell);
  const barColour =
    dir === "over" ? "bg-over" : dir === "under" ? "bg-under" : "bg-ink-faint";
  const width = cell.t != null ? Math.abs(cell.t) * 50 : 0;

  return (
    <div className="grid grid-cols-[minmax(96px,132px)_1fr_auto] items-center gap-3 border-b border-line-row py-[7px]">
      <span className="text-sm text-ink-muted">{cell.metrik.label}</span>

      <span aria-hidden className="relative h-[12px]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
        {cell.t != null && width > 0 && (
          <span
            className={`absolute top-[4px] h-[4px] rounded-xs ${barColour}`}
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
        <span className={`font-mono text-sm ${VALUE_COLOUR[dir]}`}>
          {signed(cell.diff)}
        </span>
      </span>
    </div>
  );
}

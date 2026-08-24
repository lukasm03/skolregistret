/**
 * The app's icons.
 *
 * These were text characters — `▶ ⇅ ▾ ▴ ✓ ✕ ‹ ›` — drawn from four different
 * Unicode blocks, so each platform resolved them to whatever installed face
 * happened to cover that block: different weights, different sizes and
 * different optical centres on one surface. Drawn here on a single 16-unit
 * grid they share a stroke and sit where they say they do.
 *
 * Every one takes its colour from `currentColor` and its state from the CSS
 * around it, so there is one asset per shape rather than one per state. They
 * are decoration beside text that already says the same thing, so they stay
 * out of the accessibility tree.
 *
 * `stroke` is matched to the weight of the text alongside: 2 beside the
 * medium and semibold labels this app uses, heavier only where the shape is
 * small enough to disappear.
 */

interface IconProps {
  /** Rendered size in px — the grid is unitless, so this is the only sizing. */
  size?: number;
  stroke?: number;
  className?: string;
}

function Icon({
  size = 12,
  stroke = 2,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className ?? ""}`}
    >
      {children}
    </svg>
  );
}

/** Disclosure caret. Rotates 90° to point down when what it opens is open. */
export function CaretRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </Icon>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6 8 10.5 12.5 6" />
    </Icon>
  );
}

export function ChevronLeft(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10 3.5 5.5 8 10 12.5" />
    </Icon>
  );
}

export function ChevronRight(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3.5 10.5 8 6 12.5" />
    </Icon>
  );
}

/** The mark inside a checked box — heavier, because 9px of hairline vanishes. */
export function Check(props: IconProps) {
  return (
    <Icon stroke={2.5} {...props}>
      <path d="M3 8.5 6.5 12 13 4.5" />
    </Icon>
  );
}

export function Close(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  );
}

/**
 * The sort affordance in a column header: both directions offered while the
 * column is unsorted, the one in force once it is.
 */
export function SortArrow({ dir, ...props }: IconProps & { dir: "asc" | "desc" | null }) {
  return (
    <Icon {...props}>
      {dir !== "desc" && <path d="M4.5 6.5 8 3l3.5 3.5" />}
      {dir !== "asc" && <path d="M4.5 9.5 8 13l3.5-3.5" />}
    </Icon>
  );
}


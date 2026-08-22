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

/**
 * The three appearances. Drawn on the same 16-unit grid as the rest, but
 * these carry meaning on their own rather than sitting beside a word — the
 * toggle is icon-only — so each shape is the conventional one for its job
 * and the button names it in `aria-label` as well.
 */
export function Sun(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="3.25" />
      <path d="M8 1.2v1.5M8 13.3v1.5M1.2 8h1.5M13.3 8h1.5M3.4 3.4l1.05 1.05M11.55 11.55l1.05 1.05M12.6 3.4l-1.05 1.05M4.45 11.55L3.4 12.6" />
    </Icon>
  );
}

export function Moon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.4 9.9A5.7 5.7 0 0 1 6.1 2.6 5.7 5.7 0 1 0 13.4 9.9Z" />
    </Icon>
  );
}

/** Follow the system — a screen, because that is whose setting it defers to. */
export function Monitor(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="1.75" y="2.9" width="12.5" height="8.6" rx="1.6" />
      <path d="M5.6 14.1h4.8" />
    </Icon>
  );
}

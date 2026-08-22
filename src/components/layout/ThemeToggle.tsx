"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "@/components/ui/icons";
import {
  readThemeChoice,
  serverThemeChoice,
  setThemeChoice,
  subscribeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";

/**
 * Light, dark, or whatever the system says.
 *
 * Three states rather than two, because "dark" and "follow the system" are
 * different answers and a two-way switch has to silently pick one of them for
 * you the first time you touch it. The current one is visible rather than
 * implied — a single cycling button would make you press it to find out where
 * you are.
 *
 * Icon-only: the header is a fixed 52px row that already carries a brand, a
 * nav and a search field. Each button is named in `aria-label`, and `title`
 * repeats it for a mouse.
 *
 * The choice is read rather than held. It lives in `localStorage` and on the
 * `<html>` element, both written before React starts — so this subscribes to
 * it as the external store it is instead of keeping a second copy in state
 * that would have to be reconciled on mount and again whenever another tab
 * changed it. The appearance itself never waits for any of this:
 * `THEME_INIT_SCRIPT` has already applied it before first paint, and the
 * control is only catching up with what the page is already doing.
 */

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Följ systemets utseende", Icon: Monitor },
  { value: "light", label: "Ljust utseende", Icon: Sun },
  { value: "dark", label: "Mörkt utseende", Icon: Moon },
];

export function ThemeToggle() {
  const choice = useSyncExternalStore(
    subscribeThemeChoice,
    readThemeChoice,
    serverThemeChoice,
  );

  return (
    <div
      role="group"
      aria-label="Utseende"
      className="ms-auto flex flex-none rounded-md border border-line bg-surface-segment p-0.5 sm:ms-0"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = value === choice;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setThemeChoice(value)}
            aria-label={label}
            aria-pressed={selected}
            title={label}
            className={`flex size-[22px] items-center justify-center rounded-xs transition-colors ${
              selected
                ? "bg-surface text-ink shadow-raised"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            <Icon size={13} />
          </button>
        );
      })}
    </div>
  );
}

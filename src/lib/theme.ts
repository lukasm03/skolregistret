/**
 * The appearance choice: what it is called in storage, what it does to the
 * document, and the script that replays it before the first paint.
 *
 * The mechanism itself is one line of CSS — every token in `globals.css` is a
 * `light-dark()` pair, so narrowing `color-scheme` to a single keyword picks a
 * side, and `:root[data-theme]` is what narrows it. Everything here is about
 * getting that attribute onto `<html>` early enough.
 *
 * "Early enough" means before paint, which rules out React: a class applied on
 * mount lands after the browser has already drawn a light page, and the flash
 * is the whole reason people ask for this control. So `THEME_INIT_SCRIPT` runs
 * synchronously as the first thing in `<body>`, and `ThemeToggle` takes over
 * from there.
 *
 * No React and no filesystem — this stays importable from the layout, the
 * toggle and anything else that needs the key.
 */

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "skolregistret:tema";

/**
 * The canvas colour of each appearance, matching `--canvas` in `globals.css`.
 * The browser's own chrome — the address bar on mobile, the tab strip on
 * desktop — takes its colour from this, so a manual choice has to move it too
 * or the frame around the page disagrees with the page.
 */
export const THEME_CANVAS: Record<"light" | "dark", string> = {
  light: "#edede9",
  dark: "#0e1013",
};

/**
 * Replays the stored choice onto `<html>` before anything is drawn.
 *
 * Deliberately tiny and deliberately silent: it runs render-blocking on every
 * page in the app, and `localStorage` throws rather than returning null when a
 * browser has storage switched off. An unreadable preference is the same
 * outcome as no preference — follow the system — so there is nothing to
 * report and nothing to do about it.
 */
export const THEME_INIT_SCRIPT =
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** Reads the stored choice, treating anything unrecognised as "system". */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

/**
 * Puts a choice on the page: the attribute CSS reads, and the `theme-color`
 * meta the browser chrome reads. Does not touch storage — this is also what a
 * tab runs when *another* tab made the choice, and writing it back would be a
 * second tab answering its own message.
 *
 * Both `theme-color` tags are set rather than one. Next emits a light-media
 * and a dark-media pair, and the browser takes whichever matches the *system*
 * setting — which is exactly what an explicit choice is overriding. Setting
 * both means whichever one wins carries the right colour.
 */
export function reflectThemeChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;

  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const media = meta.getAttribute("media") ?? "";
    const systemSide = media.includes("dark") ? "dark" : "light";
    meta.content = THEME_CANVAS[choice === "system" ? systemSide : choice];
  }
}

/**
 * Fired at the window when this tab changes the choice. `storage` covers the
 * other tabs and deliberately does not fire in the one that wrote it, so the
 * writer has to say so itself — this is the half of the subscription that
 * makes the control update when you press it.
 */
const THEME_EVENT = "skolregistret:temabyte";

/** The whole of a deliberate change: store it, show it, announce it. */
export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage off. The appearance still holds for this page.
  }
  reflectThemeChoice(choice);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * The subscribe half of `useSyncExternalStore`. The store is the browser —
 * `localStorage` plus the attribute on `<html>` — which is what makes this a
 * store to read rather than state to hold: it is written before React starts,
 * by the init script, and can be written by another tab afterwards.
 *
 * Module-level so its identity is stable across renders; React resubscribes
 * whenever it is not.
 */
export function subscribeThemeChoice(onStoreChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    // A null key means the whole store was cleared, which counts.
    if (e.key !== null && e.key !== THEME_STORAGE_KEY) return;
    reflectThemeChoice(readThemeChoice());
    onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onStoreChange);
  };
}

/**
 * What the server rendered, and therefore what hydration has to agree with.
 * Nothing on the server knows the reader's choice; the init script has
 * already applied it to the document by the time React gets here, so the
 * control catching up a beat later costs nothing visible.
 */
export function serverThemeChoice(): ThemeChoice {
  return "system";
}

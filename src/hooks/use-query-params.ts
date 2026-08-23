"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  paramsFromSearch,
  patchParams,
  sameParams,
  searchString,
  type RawParams,
} from "@/lib/query";

/** A set of params to change. `null` removes one; `""` keeps it empty. */
export type Patch = Record<string, string | number | null | undefined>;

/**
 * The filter state, held in the query string without leaving the page.
 *
 * `history.pushState` is a documented way to move the URL in the App Router
 * without a navigation, so the shell, the sidebar and the header stay mounted
 * and only what depends on the params re-renders. The URL still describes the
 * whole filter, so links keep working and so does the back button — a filter
 * change is one history entry, and `popstate` reads it back.
 *
 * Typing (search, the elevintervall) replaces the current entry instead, or
 * every keystroke would be a step to go back through.
 */
export function useQueryParams(initial: RawParams) {
  const [params, setParams] = useState(initial);
  const current = useRef(initial);

  useEffect(() => {
    const sync = () => {
      const next = paramsFromSearch(window.location.search);
      current.current = next;
      setParams(next);
    };
    // `initial` comes from the route's own `searchParams` now, so it usually
    // already says what the URL says and there is nothing to do — re-running
    // the selection over the whole register to arrive back where we started
    // is the one thing worth avoiding here. It can still disagree: a
    // client-side navigation can restore a cached payload under a different
    // URL, and this is what catches that.
    if (!sameParams(current.current, paramsFromSearch(window.location.search))) sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const patch = useCallback((changes: Patch, replace = false) => {
    const next = patchParams(current.current, changes);
    current.current = next;
    const url = searchString(next) || window.location.pathname;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setParams(next);
  }, []);

  return [params, patch] as const;
}

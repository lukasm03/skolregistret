"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { ButtonLink, Label } from "@/components/ui/primitives";
import { site } from "@/config/site";

/**
 * The route-level error boundary. Next passes `retry` (not `reset`) in this
 * version — it re-renders the segment, which is a real fix for the transient
 * case: the register is read off disk or fetched from the API, and both can
 * fail once and succeed on a second attempt.
 *
 * `digest` is the only thing that survives to production builds, where the
 * message itself is withheld, so it is what we show.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppShell
      section="/skolor"
      searchAction="/skolor"
      searchPlaceholder={site.search.skolor}
    >
      <div className="flex flex-col items-center gap-4 px-6 py-[92px] text-center">
        <Label>Fel</Label>
        <h1 className="text-title leading-[1.15] font-semibold tracking-[-0.015em]">
          Något gick fel
        </h1>
        <p className="max-w-[46ch] text-base leading-[1.6] text-ink-muted">
          Sidan kunde inte visas. Försök igen — går det inte andra gången heller är det
          registret bakom sidan som inte svarar.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={retry}
            className="flex h-8 items-center justify-center rounded-md border border-line bg-surface px-3 text-base font-medium transition-transform hover:border-ink-faint active:scale-[0.96]"
          >
            Försök igen
          </button>
          <ButtonLink href="/skolor">Alla skolenheter</ButtonLink>
        </div>
        {error.digest && (
          <p className="font-mono text-micro text-ink-faint">Fel-id {error.digest}</p>
        )}
      </div>
    </AppShell>
  );
}

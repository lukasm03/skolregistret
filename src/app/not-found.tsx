import { AppShell } from "@/components/layout/AppShell";
import { ButtonLink, Label } from "@/components/ui/primitives";
import { site } from "@/config/site";

/**
 * Serves both the unmatched URL and every `notFound()` in the detail routes —
 * a skolenhetskod, ett huvudmannaslug or a koncern that isn't in the register
 * export the site was built from. The search field in the shell is the fastest
 * way out, so the shell stays.
 *
 * No `metadata` export: this version documents one for `global-not-found.js`
 * only, and a `not-found.js` is not a page. The title comes from the route
 * that called `notFound()` — each detail route's `generateMetadata` answers
 * "…finns inte" for a param it cannot resolve — and from the layout's default
 * for a URL that matched no route at all.
 */
export default function NotFound() {
  return (
    <AppShell
      section="/skolor"
      searchAction="/skolor"
      searchPlaceholder={site.search.skolor}
    >
      <div className="flex flex-col items-center gap-4 px-6 py-[92px] text-center">
        <Label>404</Label>
        <h1 className="text-title leading-[1.15] font-semibold tracking-[-0.015em]">
          Sidan finns inte
        </h1>
        <p className="max-w-[46ch] text-base leading-[1.6] text-ink-muted">
          Adressen pekar på något som inte finns i registret. Skolenheter och huvudmän
          kommer ur ett bygge av Skolverkets register — en enhet som har tillkommit sedan
          dess finns med först efter nästa uppdatering.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/skolor">Alla skolenheter</ButtonLink>
          <ButtonLink href="/huvudman">Alla huvudmän</ButtonLink>
        </div>
      </div>
    </AppShell>
  );
}

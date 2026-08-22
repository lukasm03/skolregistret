import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { site } from "@/config/site";
import { THEME_CANVAS, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

/**
 * `template` is what every other route leans on: a page sets only its own
 * subject as the title and gets the brand appended. Without it each of the
 * register's thousands of prerendered pages shipped the same `<title>`, which
 * is what a bookmark, a tab strip and a shared link all show.
 */
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.brand} · ${site.riket}`,
    template: `%s · ${site.brand}`,
  },
  description: `Skolenheter och huvudmän i hela riket.`,
  openGraph: {
    type: "website",
    siteName: site.brand,
    locale: "sv_SE",
  },
};

/**
 * Matches the `--canvas` tokens in globals.css, so the browser chrome — the
 * address bar on mobile, the tab strip on desktop — takes the page's own
 * background instead of flashing a default while it loads.
 *
 * These follow the system, which is right until somebody picks an appearance
 * by hand; `applyThemeChoice` rewrites both tags when they do.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_CANVAS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_CANVAS.dark },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` because the script below writes `data-theme`
    // onto this element before React ever sees it, and React would otherwise
    // report the attribute it did not render as a mismatch.
    <html
      lang="sv"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/*
          First thing in the body and synchronous on purpose: it has to have
          run before the browser paints, or a reader who chose dark gets a
          white page first. See `lib/theme.ts`.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}

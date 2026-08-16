import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import { site } from "@/config/site";
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
  title: {
    default: `${site.brand} · ${site.riket}`,
    template: `%s · ${site.brand}`,
  },
  description: `Skolenheter och huvudmän i hela riket.`,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

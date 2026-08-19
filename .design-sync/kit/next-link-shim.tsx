import type { AnchorHTMLAttributes, ReactNode } from "react";

/** Preview-only stand-in for next/link — no Next.js router exists in a rendered design. */
export default function Link({
  href,
  children,
  ...rest
}: { href: string; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
}

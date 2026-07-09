"use client";

import type { ReactNode } from "react";

// Client wrapper so a Recent-links row opens its checkout page in a new tab on
// click. Elements marked data-row-noclick (the Created-date anchor, the admin
// "Charge now" cell) are exempt so their own click behavior wins — and the anchor
// doesn't double-fire this handler into a second tab.
export function RecentLinkRow({ token, children }: { token: string; children: ReactNode }) {
  return (
    <tr
      className="cursor-pointer"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-row-noclick]")) return;
        window.open(`/pay/${token}`, "_blank", "noopener,noreferrer");
      }}
    >
      {children}
    </tr>
  );
}

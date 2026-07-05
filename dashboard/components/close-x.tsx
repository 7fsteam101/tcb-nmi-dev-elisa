"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

// The X in the corner of an entity sub-page: closes and returns to where you
// came from (router.back). Falls back to a link when there is no history.
export function CloseX({ fallback = "/overview" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button type="button" aria-label="Close"
      onClick={() => { if (window.history.length > 1) router.back(); else router.push(fallback); }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border"
      style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--muted)" }}>
      <Icon name="x" size={16} />
    </button>
  );
}

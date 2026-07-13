import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getPortalFeatures } from "@/lib/portal";
import { PortalSettingsEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PortalAdmin() {
  // Admin-only (mirrors the admin layout + the action guards). getPortalFeatures
  // is unguarded on its own (the portal reads it), so re-check here.
  const user = await requireSession();
  if (user.role !== "admin") redirect("/overview");

  const f = await getPortalFeatures();
  return (
    <div>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        Configure what customers see and do in their self-service billing portal, plus its branding.
        Every change applies immediately — the portal reads these settings live.
      </p>
      <PortalSettingsEditor initial={f} />
    </div>
  );
}

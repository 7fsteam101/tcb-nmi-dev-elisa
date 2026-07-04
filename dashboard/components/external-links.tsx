// External-system links for a contact: Close + both GHL sub-accounts (+ Monday).
// variant="buttons" renders prominent buttons (record header); variant="urls"
// renders inline text links (the Contact Details block). GHL deep links need the
// sub-account location id (admin setting); without it the button opens GHL and
// the id is shown so the team can find the record.
export type ExternalIds = {
  closeId?: string | null;
  ghlMarketingId?: string | null;
  ghlRepairId?: string | null;
  mondayId?: string | null;
};
export type GhlLocations = { marketing?: string | null; repair?: string | null };

function build(ids: ExternalIds, loc: GhlLocations) {
  const out: { key: string; label: string; href: string | null; sub?: string }[] = [];
  if (ids.closeId) out.push({ key: "close", label: "Close", href: `https://app.close.com/lead/${ids.closeId}/`, sub: ids.closeId });
  if (ids.ghlMarketingId)
    out.push({
      key: "ghlm", label: "GHL Marketing",
      href: loc.marketing ? `https://app.gohighlevel.com/v2/location/${loc.marketing}/contacts/detail/${ids.ghlMarketingId}` : "https://app.gohighlevel.com/",
      sub: ids.ghlMarketingId,
    });
  if (ids.ghlRepairId)
    out.push({
      key: "ghlr", label: "GHL Repair",
      href: loc.repair ? `https://app.gohighlevel.com/v2/location/${loc.repair}/contacts/detail/${ids.ghlRepairId}` : "https://app.gohighlevel.com/",
      sub: ids.ghlRepairId,
    });
  if (ids.mondayId) out.push({ key: "monday", label: "Monday", href: `https://monday.com/`, sub: ids.mondayId });
  return out;
}

export function ExternalLinks({ ids, loc = {}, variant = "buttons" }: { ids: ExternalIds; loc?: GhlLocations; variant?: "buttons" | "urls" }) {
  const links = build(ids, loc);
  if (!links.length) return null;

  if (variant === "urls") {
    return (
      <div className="space-y-1">
        {links.map((l) => (
          <div key={l.key} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l.label}</span>
            {l.href
              ? <a href={l.href} target="_blank" rel="noreferrer" className="truncate" style={{ color: "var(--accent)" }}>Open {l.label} &nearr;</a>
              : <span style={{ color: "var(--muted)" }}>{l.sub}</span>}
            {l.sub && <span className="truncate text-[11px]" style={{ color: "var(--muted)" }}>({l.sub})</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((l) => (
        <a key={l.key} href={l.href ?? "#"} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium"
          style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--text)" }}>
          {l.label} <span style={{ color: "var(--muted)" }}>&nearr;</span>
        </a>
      ))}
    </div>
  );
}

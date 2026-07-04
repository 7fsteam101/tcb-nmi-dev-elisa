import { getProviderToken } from "./providers";

// Dub Analytics connector. Dub's analytics endpoint returns click counts grouped
// by dimension; we pull grouped by utm_campaigns so clicks join our campaign
// funnel on the same key. Requires a Dub Pro plan (the Analytics API is Pro-only)
// and a read API key stored in the vault (provider 'dub').
//
// Not yet wired into a cron — activate once the Dub Pro key is connected, then
// call fetchDubClicksByCampaign in /api/cron/meta (or a dedicated job) and store
// into the campaign report.
const DUB_API = "https://api.dub.co/analytics";

export type DubCampaignClicks = { campaign: string; clicks: number };

export async function fetchDubClicksByCampaign(opts: { start?: string; end?: string; interval?: string } = {}): Promise<DubCampaignClicks[]> {
  const token = await getProviderToken("dub");
  if (!token) return [];
  const params = new URLSearchParams({ event: "clicks", groupBy: "utm_campaigns" });
  if (opts.start) params.set("start", opts.start);
  if (opts.end) params.set("end", opts.end);
  if (opts.interval && !opts.start) params.set("interval", opts.interval);

  const res = await fetch(`${DUB_API}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Dub analytics ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as { utmCampaign?: string; utm_campaign?: string; clicks?: number }[];
  return rows.map((r) => ({ campaign: r.utmCampaign ?? r.utm_campaign ?? "(unattributed)", clicks: Number(r.clicks ?? 0) }));
}

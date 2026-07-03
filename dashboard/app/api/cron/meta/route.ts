import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkCronSecret } from "@/lib/webhook";
import { getProviderToken, ensureConnection, markSynced } from "@/lib/sync/providers";

export const maxDuration = 60;

// Daily Meta ad-spend pull (yesterday + today, so restatements are caught).
// Dormant until META_ACCESS_TOKEN / a meta connection + META_AD_ACCOUNT_ID exist.
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  const token = await getProviderToken("meta");
  const account = process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) return NextResponse.json({ ok: true, skipped: "meta not connected yet" });

  const connectionId = await ensureConnection("meta", account, "Meta ad account");
  const since = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const fields = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpm,cpc,actions";
  const url = `https://graph.facebook.com/v21.0/act_${account.replace(/^act_/, "")}/insights?level=ad&fields=${fields}&time_increment=1&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${token}`;

  try {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(body.error ?? body));
    let rows = 0;
    for (const r of body.data ?? []) {
      const leads = (r.actions ?? []).filter((a: any) => a.action_type?.includes("lead"))
        .reduce((s: number, a: any) => s + Number(a.value ?? 0), 0);
      await sql`
        insert into marketing.ad_spend (date, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
          spend_minor, impressions, reach, clicks, ctr, cpm_minor, cpc_minor, leads, pulled_at)
        values (${r.date_start}, ${r.campaign_id}, ${r.campaign_name}, ${r.adset_id}, ${r.adset_name},
          ${r.ad_id}, ${r.ad_name}, ${Math.round(parseFloat(r.spend ?? "0") * 100)}, ${Number(r.impressions ?? 0)},
          ${Number(r.reach ?? 0)}, ${Number(r.clicks ?? 0)}, ${Number(r.ctr ?? 0)},
          ${Math.round(parseFloat(r.cpm ?? "0") * 100)}, ${Math.round(parseFloat(r.cpc ?? "0") * 100)}, ${leads}, now())
        on conflict (date, ad_id) do update set
          spend_minor = excluded.spend_minor, impressions = excluded.impressions, reach = excluded.reach,
          clicks = excluded.clicks, ctr = excluded.ctr, cpm_minor = excluded.cpm_minor,
          cpc_minor = excluded.cpc_minor, leads = excluded.leads, pulled_at = now()`;
      rows++;
    }
    await markSynced(connectionId);
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    await markSynced(connectionId, String(err));
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

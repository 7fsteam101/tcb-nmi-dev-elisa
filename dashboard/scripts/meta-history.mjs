// Meta ad-spend history backfill: monthly chunks since 2025-01-01, level=ad,
// daily grain, paginated; upsert matches the daily cron exactly.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, fetch_types: false, max: 2, onnotice: () => {} });
const [c] = await sql`select token_secret_ref from sync.connections where provider='meta' limit 1`;
const [k] = await sql`select decrypted_secret as v from vault.decrypted_secrets where id=${c.token_secret_ref}`;
const TOK = k.v;
const ACCT = "2784491838434187";
const fields = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpm,cpc,actions";
let total = 0;
const months = [];
for (let d = new Date("2025-01-01"); d < new Date(); d.setMonth(d.getMonth() + 1)) {
  const since = d.toISOString().slice(0, 10);
  const end = new Date(d); end.setMonth(end.getMonth() + 1); end.setDate(0);
  const until = new Date(Math.min(end.getTime(), Date.now())).toISOString().slice(0, 10);
  months.push([since, until]);
}
for (const [since, until] of months) {
  let url = `https://graph.facebook.com/v21.0/act_${ACCT}/insights?level=ad&fields=${fields}&time_increment=1&time_range={"since":"${since}","until":"${until}"}&limit=500&access_token=${TOK}`;
  let monthRows = 0;
  for (let page = 0; page < 20 && url; page++) {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) { console.log(`  ${since}: ERROR ${JSON.stringify(body.error ?? body).slice(0, 140)}`); break; }
    for (const r of body.data ?? []) {
      const leads = (r.actions ?? []).filter((a) => a.action_type?.includes("lead"))
        .reduce((s, a) => s + Number(a.value ?? 0), 0);
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
      monthRows++; total++;
    }
    url = body.paging?.next ?? null;
  }
  console.log(`  ${since} -> ${until}: ${monthRows} ad-day rows`);
}
console.log("META HISTORY COMPLETE:", total, "rows");
console.log("spend total:", "$" + ((await sql`select coalesce(sum(spend_minor),0) as s from marketing.ad_spend`)[0].s / 100).toFixed(0));
await sql.end(); process.exit(0);

import { sql } from "./db";

// Granularity for the Meta report. Validated against this whitelist before it is
// ever put near SQL. date_trunc takes a text argument, so we only ever pass one
// of these three literals, never raw user input.
export type Grain = "day" | "week" | "month";
export function normalizeGrain(g: string | null | undefined): Grain {
  return g === "day" || g === "month" ? g : "week";
}

// Meta ad-spend report: spend / leads / clicks bucketed by the selected grain
// (day/week/month) over the window. One row per bucket, ordered chronologically.
// `grain` is whitelisted to a Grain literal by the caller; we still re-normalize
// here so the date_trunc argument can never be attacker-controlled. Returns
// nothing when there is no spend in range (the page renders an empty state).
export async function metaReport(
  { demo, grain, since, until }: { demo: boolean; grain: Grain; since: string; until: string | null },
) {
  const g = normalizeGrain(grain);
  return sql`
    select
      date_trunc(${g}, s.date)::date as bucket,
      coalesce(sum(s.spend_minor), 0)::bigint as spend_minor,
      coalesce(sum(s.leads), 0)::bigint as leads,
      coalesce(sum(s.clicks), 0)::bigint as clicks,
      coalesce(sum(s.impressions), 0)::bigint as impressions
    from marketing.ad_spend s
    where s.is_demo = ${demo}
      and s.date >= ${since}::date
      and (${until}::timestamptz is null or s.date < ${until}::date)
    group by 1
    order by 1 asc
  `;
}

// Lead volume by acquisition source: unique opt-ins grouped by source_channel over
// the window. One row per channel, largest first. Null/blank channels roll up to
// '(unattributed)'. Single statement (one connection). Returns nothing when there
// are no leads in range (the page renders an empty state).
export async function leadsBySource(
  { demo, since, until }: { demo: boolean; since: string; until: string | null },
) {
  return sql`
    select coalesce(nullif(trim(o.source_channel), ''), '(unattributed)') as source, count(*)::int as leads
    from sales.opt_in o
    where o.is_demo = ${demo} and o.counts_as_unique and o.counted
      and o.submitted_at >= ${since}::timestamptz
      and (${until}::timestamptz is null or o.submitted_at < ${until}::timestamptz)
    group by 1
    order by leads desc, source asc
  `;
}

// Booked calls by acquisition source: unique primary strategy-call bookings joined
// back to the booking contact's acquisition channel (the source_channel of their
// EARLIEST opt-in, i.e. first touch — same attribution rule as campaignFunnel).
// One row per channel, largest first. Single statement (one connection). Returns
// nothing when there are no bookings in range (the page renders an empty state).
export async function bookedBySource(
  { demo, since, until }: { demo: boolean; since: string; until: string | null },
) {
  return sql`
    with acq as (
      select distinct on (o.contact_id) o.contact_id,
        coalesce(nullif(trim(o.source_channel), ''), '(unattributed)') as source
      from sales.opt_in o
      where o.is_demo = ${demo} and o.contact_id is not null
      order by o.contact_id, o.submitted_at asc
    )
    select coalesce(a.source, '(unattributed)') as source, count(*)::int as booked
    from sales.call c
    join sales.opportunity opp on opp.id = c.opportunity_id
    left join acq a on a.contact_id = opp.contact_id
    where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
      and not coalesce(c.is_duplicate, false)
      and coalesce(c.current_scheduled_at, c.scheduled_at) >= ${since}::timestamptz
      and (${until}::timestamptz is null or coalesce(c.current_scheduled_at, c.scheduled_at) < ${until}::timestamptz)
    group by 1
    order by booked desc, source asc
  `;
}

// Campaign Performance: one row per utm_campaign, joining Meta spend + our funnel
// (leads -> booked -> won -> cash). A contact's acquisition campaign is the
// campaign of their EARLIEST opt-in (first touch); booked/won/cash attribute to
// that campaign. Meta joins on campaign_name = utm_campaign. Dub clicks slot in
// once the Dub connector is live (column reserved).
export async function campaignFunnel({ demo, since, until }: { demo: boolean; days: number; since: string; until: string | null }) {
  return sql`
    with acq as (
      select distinct on (o.contact_id) o.contact_id,
        coalesce(nullif(trim(o.source_campaign), ''), '(unattributed)') as campaign
      from sales.opt_in o
      where o.is_demo = ${demo} and o.contact_id is not null
      order by o.contact_id, o.submitted_at asc
    ),
    leads as (
      select coalesce(nullif(trim(o.source_campaign), ''), '(unattributed)') as campaign, count(*) as leads
      from sales.opt_in o
      where o.is_demo = ${demo} and o.counts_as_unique and o.counted
        and o.submitted_at >= ${since}::timestamptz
        and (${until}::timestamptz is null or o.submitted_at < ${until}::timestamptz)
      group by 1
    ),
    booked as (
      select a.campaign, count(*) as booked
      from sales.call c
      join sales.opportunity opp on opp.id = c.opportunity_id
      join acq a on a.contact_id = opp.contact_id
      where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
        and not coalesce(c.is_duplicate, false)
        and coalesce(c.current_scheduled_at, c.scheduled_at) >= ${since}::timestamptz
        and (${until}::timestamptz is null or coalesce(c.current_scheduled_at, c.scheduled_at) < ${until}::timestamptz)
      group by 1
    ),
    won as (
      select a.campaign, count(*) as won, coalesce(sum(d.total_contract_value_minor), 0) as tcv
      from sales.deal d
      join acq a on a.contact_id = d.contact_id
      where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= ${since}::date
        and (${until}::timestamptz is null or d.deal_close_date < ${until}::date)
      group by 1
    ),
    cash as (
      select a.campaign, coalesce(sum(p.amount_minor), 0) as cash
      from finance.successful_payment p
      join acq a on a.contact_id = p.contact_id
      where p.is_demo = ${demo} and p.type <> 'booking_25'
        and p.occurred_at >= ${since}::timestamptz
        and (${until}::timestamptz is null or p.occurred_at < ${until}::timestamptz)
      group by 1
    ),
    spend as (
      select campaign_name as campaign, coalesce(sum(spend_minor), 0) as spend,
             coalesce(sum(impressions), 0) as impressions, coalesce(sum(clicks), 0) as clicks
      from marketing.ad_spend
      where is_demo = ${demo} and date >= ${since}::date
        and (${until}::timestamptz is null or date < ${until}::date)
      group by 1
    ),
    keys as (
      select campaign from leads
      union select campaign from spend
      union select campaign from won
    )
    select k.campaign,
      coalesce(l.leads, 0)::int as leads,
      coalesce(b.booked, 0)::int as booked,
      coalesce(w.won, 0)::int as won,
      coalesce(w.tcv, 0)::bigint as tcv_minor,
      coalesce(ca.cash, 0)::bigint as cash_minor,
      coalesce(sp.spend, 0)::bigint as spend_minor,
      coalesce(sp.impressions, 0)::bigint as impressions,
      coalesce(sp.clicks, 0)::bigint as clicks
    from keys k
    left join leads l on l.campaign = k.campaign
    left join booked b on b.campaign = k.campaign
    left join won w on w.campaign = k.campaign
    left join cash ca on ca.campaign = k.campaign
    left join spend sp on sp.campaign = k.campaign
    order by coalesce(sp.spend, 0) desc, coalesce(l.leads, 0) desc
  `;
}

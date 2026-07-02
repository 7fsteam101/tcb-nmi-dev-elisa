import { sql } from "../lib/db";

// One-off reconstruction of finance.payment_plan + finance.receivable from the
// actual NMI payment history (idempotent, re-runnable):
//   cohort   = deals with >= 1 matched payment and NO payment_plan row yet;
//              deals that already have any plan are skipped, deals with zero
//              payments are left untouched (counted in dealsWithoutPayments)
//   plan     = version 1, is_current, total_minor = TCV, start_date = first
//              payment date; plan_type 'pif' when a single payment covers the
//              TCV, else 'custom'; cadence from the median gap between the
//              deal's payment dates (25-35d monthly / 11-17d biweekly /
//              5-9d weekly / anything else or <2 payments custom)
//   paid     = one receivable per actual payment (installment_no in date
//              order, due_date = paid_at = payment date, status 'paid'),
//              then the payment row's receivable_id is linked back
//   future   = remaining balance (TCV - collected, when > 0) continued on the
//              inferred cadence from the last payment date; per-installment
//              amount = the median payment, last row absorbs the remainder,
//              status 'scheduled'. custom cadence steps by the median gap
//              (30d fallback when <2 payments give no observable gap)
//   collected > TCV -> NO scheduled rows; deal counted as overcollected
// Before touching anything it waits for the NMI import to finish: the
// processor='nmi' payment count is polled every 30s until stable (same value
// twice); if still 0 after 10 minutes it exits with zeroed stats.
// Dates are the ET calendar dates of the payments (NMI is a US/ET gateway).

const ET_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const etDate = (d: Date | string) => ET_DATE.format(new Date(d)); // -> YYYY-MM-DD
const dayNum = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
const addDays = (iso: string, n: number) =>
  new Date((dayNum(iso) + n) * 864e5).toISOString().slice(0, 10);
// calendar-month stepping with day clamping (Jan 31 + 1mo -> Feb 28/29)
function addMonths(iso: string, n: number): string {
  const d = +iso.slice(8, 10);
  const t = +iso.slice(0, 4) * 12 + (+iso.slice(5, 7) - 1) + n;
  const ty = Math.floor(t / 12);
  const tm = t % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async () => {
  const stats = {
    dealsReconstructed: 0,
    paidReceivables: 0,
    scheduledReceivables: 0,
    pif: 0,
    monthly: 0,
    biweekly: 0,
    weekly: 0,
    custom: 0,
    overcollected: 0,
    dealsWithoutPayments: 0,
  };

  // ---- wait for the NMI import to settle: same count on two polls 30s apart
  const nmiCount = async () =>
    Number((await sql`select count(*)::int as n from finance.successful_payment where processor = 'nmi'`)[0].n);
  const t0 = Date.now();
  let prev = await nmiCount();
  console.error(`poll: nmi payment count = ${prev}`);
  for (;;) {
    if (prev === 0 && Date.now() - t0 >= 10 * 60_000) {
      console.log(JSON.stringify(stats));
      console.log("no NMI payments found");
      process.exit(0);
    }
    await sleep(30_000);
    const cur = await nmiCount();
    console.error(`poll: nmi payment count = ${cur}`);
    if (cur > 0 && cur === prev) break; // stable across two polls
    prev = cur;
  }

  // ---- cohort: deals with no payment_plan row at all (idempotent skip)
  const deals = await sql`
    select d.id, d.total_contract_value_minor as tcv
    from sales.deal d
    where not exists (select 1 from finance.payment_plan pp where pp.deal_id = d.id)
    order by d.deal_close_date asc, d.id asc`;

  // all matched payments, oldest first (id tiebreak for same-instant charges);
  // the $25 booking fees carry deal_id null so they are excluded by definition
  const pays = await sql`
    select id, deal_id, amount_minor, occurred_at
    from finance.successful_payment
    where deal_id is not null
    order by occurred_at asc, id asc`;
  const byDeal = new Map<string, typeof pays>();
  for (const p of pays) {
    if (!byDeal.has(p.deal_id)) byDeal.set(p.deal_id, [] as unknown as typeof pays);
    byDeal.get(p.deal_id)!.push(p);
  }

  const reconstructed: { dealId: string; n: number }[] = [];

  for (const deal of deals) {
    const ps = byDeal.get(deal.id);
    if (!ps || !ps.length) {
      stats.dealsWithoutPayments++; // untouched
      continue;
    }
    const tcv = Number(deal.tcv);
    const dates = ps.map((p) => etDate(p.occurred_at)); // ascending ET dates
    const amounts = ps.map((p) => Number(p.amount_minor));
    const collected = amounts.reduce((a, b) => a + b, 0);

    // cadence from the median gap between this deal's payment dates
    const gaps = dates.slice(1).map((d, i) => dayNum(d) - dayNum(dates[i]));
    const g = gaps.length ? median(gaps) : null;
    const cadence: "monthly" | "biweekly" | "weekly" | "custom" =
      g === null ? "custom"
      : g >= 25 && g <= 35 ? "monthly"
      : g >= 11 && g <= 17 ? "biweekly"
      : g >= 5 && g <= 9 ? "weekly"
      : "custom";
    const planType = amounts.some((a) => a >= tcv) ? "pif" : "custom";

    // scheduled continuation for the uncollected balance
    const remaining = tcv - collected;
    const scheduled: { due: string; amount: number }[] = [];
    if (remaining > 0) {
      const per = Math.max(1, Math.round(median(amounts)));
      const k = Math.max(1, Math.floor(remaining / per)); // last row absorbs the remainder
      const stepDays =
        cadence === "weekly" ? 7
        : cadence === "biweekly" ? 14
        : cadence === "custom" ? (g !== null && Math.round(g) >= 1 ? Math.round(g) : 30)
        : 0; // monthly steps by calendar month instead
      const last = dates[dates.length - 1];
      for (let i = 1; i <= k; i++) {
        scheduled.push({
          due: cadence === "monthly" ? addMonths(last, i) : addDays(last, stepDays * i),
          amount: i < k ? per : remaining - per * (k - 1),
        });
      }
    } else if (remaining < 0) {
      stats.overcollected++;
    }

    // all-or-nothing per deal: plan + receivables + payment backlinks
    await sql.begin(async (tx) => {
      const [plan] = await tx`
        insert into finance.payment_plan
          (deal_id, version, plan_type, total_minor, is_current, cadence, start_date)
        values
          (${deal.id}, 1, ${planType}::public.plan_type, ${tcv}, true,
           ${cadence}::public.payment_cadence, ${dates[0]})
        returning id`;
      let no = 0;
      for (let i = 0; i < ps.length; i++) {
        const [rcv] = await tx`
          insert into finance.receivable
            (payment_plan_id, deal_id, installment_no, due_date, amount_minor, status, paid_at, payment_id)
          values
            (${plan.id}, ${deal.id}, ${++no}, ${dates[i]}, ${amounts[i]},
             'paid'::public.receivable_status, ${dates[i]}, ${ps[i].id})
          returning id`;
        await tx`update finance.successful_payment set receivable_id = ${rcv.id} where id = ${ps[i].id}`;
      }
      for (const s of scheduled) {
        await tx`
          insert into finance.receivable
            (payment_plan_id, deal_id, installment_no, due_date, amount_minor, status)
          values
            (${plan.id}, ${deal.id}, ${++no}, ${s.due}, ${s.amount}, 'scheduled'::public.receivable_status)`;
      }
    });

    stats.dealsReconstructed++;
    stats.paidReceivables += ps.length;
    stats.scheduledReceivables += scheduled.length;
    if (planType === "pif") stats.pif++;
    else stats[cadence]++; // one bucket per reconstructed deal
    reconstructed.push({ dealId: deal.id, n: ps.length });
  }

  console.log(JSON.stringify(stats));

  // ---- spot check 3 deals (most payments first): payments sum vs paid-receivables sum
  reconstructed.sort((a, b) => b.n - a.n);
  let ok = true;
  for (const { dealId } of reconstructed.slice(0, 3)) {
    const [v] = await sql`
      select
        (select count(*)::int from finance.successful_payment where deal_id = ${dealId}) as pay_n,
        (select coalesce(sum(amount_minor), 0)::int from finance.successful_payment where deal_id = ${dealId}) as pay_sum,
        (select count(*)::int from finance.receivable where deal_id = ${dealId} and status = 'paid') as rcv_n,
        (select coalesce(sum(amount_minor), 0)::int from finance.receivable where deal_id = ${dealId} and status = 'paid') as rcv_sum,
        (select count(*)::int from finance.successful_payment where deal_id = ${dealId} and receivable_id is not null) as linked_n,
        (select total_contract_value_minor from sales.deal where id = ${dealId}) as tcv`;
    const match =
      Number(v.pay_sum) === Number(v.rcv_sum) &&
      Number(v.pay_n) === Number(v.rcv_n) &&
      Number(v.linked_n) === Number(v.pay_n);
    if (!match) ok = false;
    console.log(
      `VERIFY deal ${dealId}: payments n=${v.pay_n} sum=${v.pay_sum} | paid receivables n=${v.rcv_n} sum=${v.rcv_sum} | payments backlinked=${v.linked_n} | tcv=${v.tcv} -> ${match ? "MATCH" : "MISMATCH"}`,
    );
  }
  process.exit(ok ? 0 : 1);
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

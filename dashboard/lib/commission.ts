import { sql } from "./db";

// Rule-driven commission. Each rep's commission is computed from the rules that
// are enabled for them (sales.commission_rule + per-rep sales.rep_commission_setting):
//   base_rate       — rate on cash collected
//   tier_bonus      — replaces base rate while trailing-14d close rate >= threshold
//   refund_clawback — deduct a rate on cash tied to now-refunded deals
// Toggling a rule off for a rep (admin) removes its effect. Estimate only;
// payroll runs off validated reports.
export type RepCommission = {
  rep_id: string; full_name: string;
  cash_minor: number; refunded_cash_minor: number; close_rate_14d: number;
  effective_rate: number; tier_active: boolean; owed_minor: number;
  rules: { key: string; name: string; enabled: boolean }[];
};

type RuleRow = { id: string; key: string; name: string; params: any; default_enabled: boolean };

export async function commissionForReps(demo: boolean, days: number): Promise<RepCommission[]> {
  const [rules, settings, stats] = await Promise.all([
    sql`select id, key, name, params, default_enabled from sales.commission_rule order by sort_order` as unknown as Promise<RuleRow[]>,
    sql`select rep_id, rule_id, enabled, override_params from sales.rep_commission_setting`,
    sql`
      with cash as (
        select p.rep_id, coalesce(sum(p.amount_minor),0) as collected
        from finance.successful_payment p
        where p.is_demo = ${demo} and p.type <> 'booking_25' and p.occurred_at >= now() - make_interval(days => ${days})
        group by p.rep_id),
      refunded as (
        select p.rep_id, coalesce(sum(p.amount_minor),0) as refunded_cash
        from finance.successful_payment p join sales.deal d on d.id = p.deal_id and d.status = 'refunded'
        where p.is_demo = ${demo} and p.type <> 'booking_25' and p.occurred_at >= now() - make_interval(days => ${days})
        group by p.rep_id),
      tier as (
        select c.rep_id, count(*) filter (where c.disposition = 'closed')::numeric / nullif(count(*),0) as close_rate_14d
        from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
        where c.is_demo = ${demo} and c.type = 'strategy' and a.scheduled_for >= now() - interval '14 days'
        group by c.rep_id)
      select rep.id, rep.full_name,
        coalesce(ch.collected,0) as cash_minor,
        coalesce(rf.refunded_cash,0) as refunded_cash_minor,
        coalesce(tr.close_rate_14d,0) as close_rate_14d
      from sales.rep rep
      left join cash ch on ch.rep_id = rep.id
      left join refunded rf on rf.rep_id = rep.id
      left join tier tr on tr.rep_id = rep.id
      where rep.active and rep.role in ('closer','hybrid')
      order by coalesce(ch.collected,0) desc, rep.full_name`,
  ]);

  const ruleByKey = new Map(rules.map((r) => [r.key, r]));
  const settingMap = new Map<string, { enabled: boolean; override: any }>();
  for (const s of settings as any[]) settingMap.set(`${s.rep_id}|${s.rule_id}`, { enabled: s.enabled, override: s.override_params });

  const enabledFor = (repId: string, rule: RuleRow) => {
    const s = settingMap.get(`${repId}|${rule.id}`);
    return s ? s.enabled : rule.default_enabled;
  };
  const paramsFor = (repId: string, rule: RuleRow) => {
    const s = settingMap.get(`${repId}|${rule.id}`);
    return (s && s.override) ? s.override : rule.params;
  };

  return (stats as any[]).map((st) => {
    const base = ruleByKey.get("base_rate"), tier = ruleByKey.get("tier_bonus"), claw = ruleByKey.get("refund_clawback");
    const baseOn = base ? enabledFor(st.id, base) : false;
    const tierOn = tier ? enabledFor(st.id, tier) : false;
    const clawOn = claw ? enabledFor(st.id, claw) : false;

    const baseRate = baseOn ? Number(paramsFor(st.id, base!).rate ?? 0.1) : 0;
    const tp = tierOn ? paramsFor(st.id, tier!) : null;
    const tierActive = !!(tp && Number(st.close_rate_14d) >= Number(tp.threshold ?? 0.333));
    const effRate = tierActive ? Number(tp!.rate ?? 0.15) : baseRate;
    const clawRate = clawOn ? Number(paramsFor(st.id, claw!).rate ?? 0.1) : 0;

    const owed = Math.round(Number(st.cash_minor) * effRate - Number(st.refunded_cash_minor) * clawRate);
    return {
      rep_id: st.id, full_name: st.full_name,
      cash_minor: Number(st.cash_minor), refunded_cash_minor: Number(st.refunded_cash_minor),
      close_rate_14d: Number(st.close_rate_14d), effective_rate: effRate, tier_active: tierActive,
      owed_minor: owed,
      rules: [base, tier, claw].filter(Boolean).map((r) => ({ key: r!.key, name: r!.name, enabled: enabledFor(st.id, r!) })),
    };
  });
}

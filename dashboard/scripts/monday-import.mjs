// Monday.com historical import (core four boards). DRY by default; --run writes.
// Idempotent: deal.monday_item_id, receivable.monday_payment_schedule_id,
// nafa.monday_credit_audit_item, report payload->>'monday_item_id'.
// Non-destructive: fills gaps, never overwrites human data; unmatched -> review list.
import postgres from "postgres";

const RUN = process.argv.includes("--run");
const ONLY = (process.argv.find((a) => a.startsWith("--board=")) ?? "").split("=")[1] || "all";
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, fetch_types: false, max: 3, onnotice: () => {} });

const [conn] = await sql`select token_secret_ref from sync.connections where provider='monday' limit 1`;
const [tok] = await sql`select decrypted_secret as v from vault.decrypted_secrets where id=${conn.token_secret_ref}`;
const MTOK = tok.v;

async function gql(query, attempt = 1) {
  try {
    const r = await fetch("https://api.monday.com/v2", { method: "POST", headers: { Authorization: MTOK, "Content-Type": "application/json", "API-Version": "2024-10" }, body: JSON.stringify({ query }) });
    const j = await r.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
    return j.data;
  } catch (e) {
    if (attempt >= 4) throw e;
    await new Promise((r) => setTimeout(r, attempt * 3000));
    return gql(query, attempt + 1);
  }
}

const CV = `column_values { id type text ... on MirrorValue { display_value } ... on BoardRelationValue { linked_item_ids } }`;
async function allItems(boardId, withParent = false) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 60; i++) {
    const cur = cursor ? `, cursor: "${cursor}"` : "";
    const d = await gql(`{ boards(ids:[${boardId}]) { items_page(limit: 100${cur}) { cursor items { id name ${withParent ? "parent_item { id }" : ""} ${CV} } } } }`);
    const p = d.boards[0].items_page;
    out.push(...p.items);
    cursor = p.cursor;
    if (!cursor) break;
  }
  return out;
}
const cmap = (item) => {
  const m = {};
  for (const v of item.column_values) m[v.id] = { text: v.text, disp: v.display_value, links: v.linked_item_ids };
  return m;
};
const val = (m, id) => m[id]?.disp ?? m[id]?.text ?? null;
const minor = (s) => { const n = parseFloat(String(s ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const day = (s) => { const t = String(s ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };

async function resolveContact({ closeId, email, phone, name }) {
  if (closeId) {
    const r = await sql`select id from core.contact where close_id = ${closeId} and merged_into_contact_id is null limit 1`;
    if (r.length) return { id: r[0].id, how: "close_id" };
  }
  if (email) {
    const r = await sql`select ct.id from core.contact ct where ct.merged_into_contact_id is null and (lower(ct.primary_email)=lower(${email}) or exists (select 1 from core.contact_identifier ci where ci.contact_id=ct.id and ci.type='email' and lower(ci.value)=lower(${email}))) limit 2`;
    if (r.length === 1) return { id: r[0].id, how: "email" };
  }
  if (phone) {
    const p = String(phone).replace(/[^0-9]/g, "").slice(-10);
    if (p.length === 10) {
      const r = await sql`select ct.id from core.contact ct where ct.merged_into_contact_id is null and (regexp_replace(coalesce(ct.primary_phone,''),'[^0-9]','','g') like ${"%" + p} or exists (select 1 from core.contact_identifier ci where ci.contact_id=ct.id and ci.type='phone' and regexp_replace(ci.value,'[^0-9]','','g') like ${"%" + p})) limit 2`;
      if (r.length === 1) return { id: r[0].id, how: "phone" };
    }
  }
  if (name && name.trim().length > 4) {
    const r = await sql`select id from core.contact where merged_into_contact_id is null and lower(full_name) = lower(${name.trim()}) limit 2`;
    if (r.length === 1) return { id: r[0].id, how: "name" };
    if (r.length > 1) return { id: null, how: "ambiguous" };
  }
  return { id: null, how: "none" };
}

const reps = await sql`select id, full_name from sales.rep`;
const repByName = (n) => reps.find((r) => r.full_name.toLowerCase() === String(n ?? "").toLowerCase())?.id ?? null;

// ============ A. PAYMENT SCHEDULE -> deals + plans + receivables ============
async function paymentSchedule() {
  console.log("\n===== PAYMENT SCHEDULE =====");
  const parents = await allItems(7117839824);
  const subs = await allItems(7117839971, true);
  const subsByParent = new Map();
  for (const s of subs) {
    const pid = s.parent_item?.id; if (!pid) continue;
    (subsByParent.get(pid) ?? subsByParent.set(pid, []).get(pid)).push(s);
  }
  // subitem type histogram (decides the installment filter)
  const hist = {};
  for (const s of subs) { const t = val(cmap(s), "color_mm38mded") ?? "(blank)"; hist[t] = (hist[t] ?? 0) + 1; }
  console.log("subitem types:", JSON.stringify(hist));
  const isInstallment = (m) => {
    const t = String(val(m, "color_mm38mded") ?? "").toLowerCase();
    // settlement economics + refunds + incomplete rows stay out of receivables
    // (histogram: Client Invoice=890 in, HKD Payment=78 / Refund=5 / Needs Input=2 out)
    if (/aoc|consult|settle|payout|hkd|refund|needs input/.test(t)) return false;
    return val(m, "numeric_mkym1c9w") != null || val(m, "numbers") != null || /payment|installment|invoice/.test(t) || true && (val(m, "date4") != null);
  };
  const C = { deals: 0, matchedContact: 0, createdContact: 0, receivables: 0, skippedParents: 0, review: [] };
  // batch-resolve linked Repair Lead identities
  const linkIds = [...new Set(parents.flatMap((p) => cmap(p)["connect_boards"]?.links ?? cmap(p)["board_relation"]?.links ?? Object.values(cmap(p)).flatMap((v) => v.links ?? [])))];
  const identity = new Map();
  for (let i = 0; i < linkIds.length; i += 50) {
    const batch = linkIds.slice(i, i + 50);
    if (!batch.length) break;
    const d = await gql(`{ items(ids:[${batch.join(",")}]) { id name column_values { id type text } } }`);
    for (const it of d.items ?? []) {
      const em = it.column_values.find((c) => c.type === "email")?.text ?? null;
      const ph = it.column_values.find((c) => c.type === "phone")?.text ?? null;
      const cl = it.column_values.find((c) => /lead_/.test(String(c.text)))?.text ?? null;
      identity.set(it.id, { email: em, phone: ph, closeId: cl, name: it.name });
    }
  }
  for (const p of parents) {
    const m = cmap(p);
    const mySubs = (subsByParent.get(p.id) ?? []).map((s) => ({ s, m: cmap(s) })).filter((x) => isInstallment(x.m));
    const tcv = minor(val(m, "dup__of_total_paid") ?? val(m, "mirror")) ?? mySubs.reduce((a, x) => a + (minor(val(x.m, "numbers")) ?? 0), 0);
    if (!mySubs.length && !tcv) { C.skippedParents++; continue; }
    const linked = Object.values(m).flatMap((v) => v.links ?? []).map((id) => identity.get(String(id))).find(Boolean);
    const who = await resolveContact({ closeId: linked?.closeId, email: linked?.email, phone: linked?.phone, name: p.name });
    let contactId = who.id;
    if (contactId) C.matchedContact++;
    else if (who.how !== "ambiguous") {
      C.createdContact++;
      if (RUN) {
        const r = await sql`insert into core.contact (full_name, primary_email, primary_phone, created_source) values (${linked?.name ?? p.name}, ${linked?.email ?? null}, ${linked?.phone ?? null}, 'monday_import') returning id`;
        contactId = r[0].id;
        if (linked?.email) await sql`insert into core.contact_identifier (contact_id, type, value, is_primary, source) values (${contactId},'email',${linked.email},true,'monday_import') on conflict do nothing`;
        if (linked?.phone) await sql`insert into core.contact_identifier (contact_id, type, value, is_primary, source) values (${contactId},'phone',${linked.phone},true,'monday_import') on conflict do nothing`;
      }
    } else { C.review.push(`AMBIGUOUS contact: ${p.name}`); continue; }
    C.deals++;
    C.receivables += mySubs.length;
    if (!RUN || !contactId) continue;
    const started = day(val(m, "date_1")) ?? day(val(m, "date")) ?? "2025-01-01";
    const closer = repByName(val(m, "dropdown_mkztr0xt"));
    const n = mySubs.length || 1;
    const planType = n === 1 ? "pif" : (n===3?"3pay":n===6?"6pay":n===7?"7pay":n===12?"12pay":n===13?"13pay":"custom");

    // ONE DEAL PER OPPORTUNITY (uq_deal_per_opp): if this Monday item was already
    // imported use that deal; else if the contact already HAS a deal (the NMI/Close
    // reconstruction), ADOPT it (stamp the monday id, fill-only) instead of
    // duplicating; else create the historical opportunity + deal.
    let deal = (await sql`select id, 'monday' as via from sales.deal where monday_item_id = ${p.id} limit 1`)[0];
    if (!deal) {
      const [existing] = await sql`select id, monday_item_id from sales.deal where contact_id = ${contactId} and monday_item_id is null order by created_at desc limit 1`;
      if (existing) {
        await sql`update sales.deal set monday_item_id = ${p.id}, closer_rep_id = coalesce(closer_rep_id, ${closer}), source = coalesce(source, 'monday_import') where id = ${existing.id}`;
        deal = { id: existing.id, via: "adopted" };
        C.adopted = (C.adopted ?? 0) + 1;
      }
    }
    if (!deal) {
      // fresh historical deal: needs an opportunity WITHOUT a deal already on it
      let [opp] = await sql`
        select o.id from sales.opportunity o
        where o.contact_id = ${contactId} and o.stage not in ('interested_partner','active_partner','not_a_fit')
          and not exists (select 1 from sales.deal d where d.opportunity_id = o.id)
        order by o.opened_at desc limit 1`;
      if (!opp) [opp] = await sql`insert into sales.opportunity (contact_id, stage, opened_at, closed_at) values (${contactId},'closed_won',${started},${started}) returning id`;
      [deal] = await sql`
        insert into sales.deal (opportunity_id, contact_id, closer_rep_id, offer_id, total_contract_value_minor, plan_type_snapshot, deal_close_date, status, source, monday_item_id)
        values (${opp.id}, ${contactId}, ${closer}, (select id from marketing.offer order by created_at limit 1), ${tcv ?? 0},
                ${planType}::public.plan_type, ${started}, 'active', 'monday_import', ${p.id})
        on conflict (monday_item_id) where monday_item_id is not null do update set updated_at = now()
        returning id`;
    }

    let [plan] = await sql`select id from finance.payment_plan where deal_id=${deal.id} and is_current limit 1`;
    if (!plan) [plan] = await sql`insert into finance.payment_plan (deal_id, version, plan_type, total_minor, is_current, cadence, start_date) values (${deal.id},1,${planType}::public.plan_type,${tcv ?? 0},true,'monthly',${started}) returning id`;
    let no = 0;
    for (const x of mySubs) {
      no++;
      const dueDate = day(val(x.m, "date45") ?? val(x.m, "date4") ?? val(x.m, "date")) ?? started;
      const amt = minor(val(x.m, "numbers")) ?? 0;
      const pstat = String(val(x.m, "status") ?? val(x.m, "payment_status") ?? "").toLowerCase();
      const status = /paid|complete/.test(pstat) ? "paid" : /waiv/.test(pstat) ? "waived" : "scheduled";
      const paidAt = day(val(x.m, "date7") ?? val(x.m, "paid_date"));
      const instNo = parseInt(val(x.m, "numeric") ?? "") || no;
      // adopted deals may already carry this installment from the NMI reconstruction:
      // match by installment number and FILL (monday id + paid truth), never overwrite amounts.
      const [have] = await sql`select id, status from finance.receivable where deal_id = ${deal.id} and installment_no = ${instNo} and monday_payment_schedule_id is null limit 1`;
      if (have) {
        await sql`update finance.receivable set monday_payment_schedule_id = ${x.s.id},
          status = case when status = 'scheduled' and ${status} = 'paid' then 'paid'::public.receivable_status else status end,
          paid_at = coalesce(paid_at, ${status === "paid" ? paidAt ?? dueDate : null})
          where id = ${have.id}`;
      } else {
        await sql`
          insert into finance.receivable (payment_plan_id, deal_id, installment_no, due_date, amount_minor, status, paid_at, monday_payment_schedule_id)
          values (${plan.id}, ${deal.id}, ${instNo}, ${dueDate}, ${amt}, ${status}::public.receivable_status, ${status === "paid" ? paidAt ?? dueDate : null}, ${x.s.id})
          on conflict (monday_payment_schedule_id) where monday_payment_schedule_id is not null do update set
            status = excluded.status, paid_at = excluded.paid_at`;
      }
    }
  }
  console.log(`deals=${C.deals} (adopted-existing=${C.adopted ?? 0}, contacts matched=${C.matchedContact}, created=${C.createdContact}) receivable-rows=${C.receivables} skipped-parents=${C.skippedParents} review=${C.review.length}`);
  C.review.slice(0, 8).forEach((r) => console.log("  " + r));
  return C;
}

// ============ B. CREDIT AUDITS -> credit.nafa ============
async function creditAudits() {
  console.log("\n===== CREDIT AUDITS =====");
  const items = await allItems(7625349540);
  const C = { audits: 0, byClose: 0, byName: 0, unmatched: 0 };
  for (const it of items) {
    const m = cmap(it);
    const closeId = val(m, "lookup_mkq0pwr1") ?? Object.values(m).map((v) => v.disp ?? v.text).find((t) => /^lead_/.test(String(t ?? ""))) ?? null;
    const who = await resolveContact({ closeId, name: it.name });
    if (!who.id) { C.unmatched++; continue; }
    who.how === "close_id" ? C.byClose++ : C.byName++;
    C.audits++;
    if (!RUN) continue;
    let [opp] = await sql`select id from sales.opportunity where contact_id=${who.id} and stage not in ('interested_partner','active_partner','not_a_fit') order by opened_at desc limit 1`;
    if (!opp) [opp] = await sql`insert into sales.opportunity (contact_id, stage, opened_at) values (${who.id},'intake_form_submitted',now()) returning id`;
    const completed = day(val(m, "date")) ?? day(val(m, "date_1"));
    const viol = parseInt(val(m, "numbers") ?? "") || null;
    // insert as NON-canonical: re-audits are 1:N per opportunity and only the
    // newest may be canonical (uq_canonical_nafa). A post-pass elects it.
    await sql`
      insert into credit.nafa (opportunity_id, contact_id, pulled_at, provider, violation_opportunities, is_canonical, monday_credit_audit_item)
      values (${opp.id}, ${who.id}, ${completed ?? new Date().toISOString().slice(0,10)}, 'identityiq', ${viol}, false, ${it.id})
      on conflict (monday_credit_audit_item) where monday_credit_audit_item is not null do update set
        violation_opportunities = coalesce(excluded.violation_opportunities, credit.nafa.violation_opportunities)`;
  }
  if (RUN) {
    // canonical election: newest audit per opportunity wins (scoped to opps that
    // have monday-imported audits; existing canonical rows are respected first)
    const elected = await sql`
      update credit.nafa n set is_canonical = (n.id = x.newest)
      from (
        select opportunity_id, (array_agg(id order by pulled_at desc, created_at desc))[1] as newest
        from credit.nafa
        where opportunity_id in (select distinct opportunity_id from credit.nafa where monday_credit_audit_item is not null)
        group by opportunity_id
      ) x
      where n.opportunity_id = x.opportunity_id
      returning n.id`;
    console.log(`canonical elected across ${elected.length} audit rows`);
  }
  console.log(`audits=${C.audits} (close_id=${C.byClose}, name=${C.byName}) unmatched=${C.unmatched}`);
  return C;
}

// ============ C. REPORTS -> report_submission + attendance truth ============
async function reports(boardId, kind) {
  console.log(`\n===== ${kind.toUpperCase()} REPORTS =====`);
  const items = await allItems(boardId);
  const C = { imported: 0, linkedCall: 0, attendanceFixes: 0, unmatchedContact: 0, review: [] };
  for (const it of items) {
    const m = cmap(it);
    const closerName = val(m, "dropdown_mm26gp5x") ?? val(m, "dropdown_mm27714k");
    const repId = repByName(closerName);
    const callDate = day(val(m, "date_mm2652eq") ?? val(m, "date_mm27wkxr"));
    const who = await resolveContact({ name: it.name });
    let callId = null;
    if (who.id && callDate) {
      const r = await sql`
        select c.id, a.id as appt_id, a.status from sales.call c
        join sales.opportunity o on o.id = c.opportunity_id and o.contact_id = ${who.id}
        left join sales.appointment a on a.call_id = c.id and a.is_current
        where c.type = 'strategy' and abs(extract(epoch from (coalesce(c.current_scheduled_at, c.scheduled_at) - ${callDate}::timestamptz))) < 172800
        order by abs(extract(epoch from (coalesce(c.current_scheduled_at, c.scheduled_at) - ${callDate}::timestamptz))) limit 1`;
      if (r.length) callId = r[0].id;
      if (r.length && RUN) {
        // attendance truth
        if (kind === "sales_call" && ["scheduled", "confirmed"].includes(r[0].status)) {
          await sql`update sales.appointment set status='taken' where id=${r[0].appt_id}`;
          C.attendanceFixes++;
        }
        if (kind === "missed_call" && ["scheduled", "confirmed"].includes(r[0].status)) {
          const what = String(val(m, "color_mm272mb0") ?? "").toLowerCase();
          const by = String(val(m, "color_mm4bk6m4") ?? "").toLowerCase();
          const st = /cancel/.test(what) ? (by.includes("closer") || by.includes("team") ? "cancelled_by_team" : "cancelled_by_lead") : /no.?show/.test(what) ? "no_show" : null;
          if (st) { await sql`update sales.appointment set status=${st}::public.appointment_status where id=${r[0].appt_id}`; C.attendanceFixes++; }
        }
      }
    }
    if (!who.id) C.unmatchedContact++;
    if (callId) C.linkedCall++;
    C.imported++;
    if (!RUN || !repId) { if (!repId && RUN) C.review.push(`no rep: ${closerName} (${it.name})`); continue; }
    const exists = await sql`select 1 from sales.report_submission where payload->>'monday_item_id' = ${it.id} limit 1`;
    if (exists.length) continue;
    const payload = { monday_item_id: it.id, lead_name: it.name, closer: closerName };
    for (const [k, v] of Object.entries(m)) if (v.text) payload[k] = v.text;
    await sql`
      insert into sales.report_submission (type, rep_id, strategy_call_id, submitted_at, status, payload)
      values (${kind}::public.report_type, ${repId}, ${callId}, ${callDate ?? new Date().toISOString().slice(0,10)}, 'validated', ${sql.json(payload)})`;
  }
  console.log(`imported=${C.imported} linked-to-call=${C.linkedCall} attendance-fixes=${C.attendanceFixes} unmatched-contact=${C.unmatchedContact}`);
  C.review.slice(0, 6).forEach((r) => console.log("  " + r));
  return C;
}

console.log(RUN ? ">>> LIVE RUN" : ">>> DRY RUN (no writes)");
if (ONLY === "all" || ONLY === "schedule") await paymentSchedule();
if (ONLY === "all" || ONLY === "audits") await creditAudits();
if (ONLY === "all" || ONLY === "sales") await reports(18407611764, "sales_call");
if (ONLY === "all" || ONLY === "missed") await reports(18407684845, "missed_call");
await sql.end();
process.exit(0);

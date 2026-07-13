import { sql } from "../db";

// Test-data classification (Katie, July 10). Admin-managed rules in
// core.test_rule: emails match exactly (case-insensitive), keywords match as a
// STANDALONE WORD in the contact name (word boundaries, so a real surname
// containing the letters never flags). Flagging reuses is_demo (the exclusion
// every query already respects) and cascades to the contact's children; the
// reason is recorded on the contact and everything is reversible.

type Rule = { kind: "email" | "keyword"; value: string };
let cache: { rules: Rule[]; at: number } | null = null;

async function rules(): Promise<Rule[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rules;
  const rows = await sql`select kind, value from core.test_rule`;
  cache = { rules: rows.map((r: any) => ({ kind: r.kind, value: String(r.value) })), at: Date.now() };
  return cache.rules;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordHit = (name: string, kw: string) =>
  new RegExp(`(^|[^a-z0-9])${esc(kw.toLowerCase())}([^a-z0-9]|$)`, "i").test(name);

/** Returns the matched-rule reason, or null when the contact looks real. */
export async function evaluateTestRules(name: string | null | undefined, email: string | null | undefined): Promise<string | null> {
  const rs = await rules();
  const em = (email ?? "").trim().toLowerCase();
  if (em) {
    const hit = rs.find((r) => r.kind === "email" && r.value.trim().toLowerCase() === em);
    if (hit) return `matched test email rule: ${hit.value}`;
  }
  const nm = (name ?? "").trim();
  if (nm) {
    const hit = rs.find((r) => r.kind === "keyword" && wordHit(nm, r.value));
    if (hit) return `matched test keyword rule: "${hit.value}"`;
  }
  return null;
}

/** Flag (or untrack=false to restore) a contact + every child row. */
export async function setContactTestFlag(contactId: string, flagged: boolean, reason: string | null) {
  const f = flagged;
  await sql`update sales.opportunity set is_demo = ${f} where contact_id = ${contactId}`;
  await sql`update sales.call set is_demo = ${f} where opportunity_id in (select id from sales.opportunity where contact_id = ${contactId})`;
  await sql`update sales.appointment set is_demo = ${f} where call_id in (select c.id from sales.call c join sales.opportunity o on o.id = c.opportunity_id where o.contact_id = ${contactId})`;
  await sql`update sales.opt_in set is_demo = ${f} where contact_id = ${contactId}`;
  await sql`update sales.deal set is_demo = ${f} where contact_id = ${contactId}`;
  await sql`update finance.payment_plan set is_demo = ${f} where deal_id in (select id from sales.deal where contact_id = ${contactId})`;
  await sql`update finance.receivable set is_demo = ${f} where deal_id in (select id from sales.deal where contact_id = ${contactId})`;
  await sql`update finance.successful_payment set is_demo = ${f} where contact_id = ${contactId} or deal_id in (select id from sales.deal where contact_id = ${contactId})`;
  await sql`update sales.agreement set is_demo = ${f} where contact_id = ${contactId}`;
  await sql`update core.contact set is_demo = ${f}, test_reason = ${flagged ? reason : null} where id = ${contactId}`;
}

/** Apply the rules to every live tracked contact (retro sweep; also cron-safe). */
export async function sweepTestRules(): Promise<number> {
  const candidates = await sql`
    select id, full_name, primary_email from core.contact
    where merged_into_contact_id is null and not is_demo`;
  let flagged = 0;
  for (const c of candidates) {
    const reason = await evaluateTestRules(c.full_name, c.primary_email);
    if (reason) {
      await setContactTestFlag(c.id, true, reason);
      flagged++;
    }
  }
  return flagged;
}

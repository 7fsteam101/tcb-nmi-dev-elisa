# The Credit Brothers: Decisions Log

Prepared by 8 Figure Systems, June 23, 2026. **Updated July 2, 2026 with the second (technical) call.**

The sales system is live. The eleven items below were the original open decisions. The **"July 2 Technical Call"** section at the bottom is the current source of truth: it records what was confirmed on that call and the new decisions that came out of it. When the two disagree, the July 2 section wins (noted inline where it supersedes an earlier default).

## Definitions and KPIs

**1. Should partner deals count in your sales KPIs?**
Your Close pipeline carries an affiliate track (Interested Partner with 24 opportunities, plus Active Partner) alongside the consumer funnel. We can blend those into close rate and revenue, or keep the sales KPIs consumer-only and report partners on their own.
Our default: exclude partners from close-rate and revenue KPIs, and add a separate partner section later.

**2. Once zero-down launches, what counts as a closed deal?**
The new pricing (up to about $4k, with a "start free" zero-down option) conflicts with the locked rule that Closed-Won means marked Won plus at least one processed payment. The options: agreement signed and program started counts as won, or nothing counts until the first payment lands. The answer moves both close rate and commission.
Our default: signed and started counts as won for close rate; commission stays on cash collected, so a zero-down deal pays out as installments land.

**3. Is your ad account on Eastern or Pacific time?**
Daily numbers bucket by the ad account timezone, and we are currently defaulting to Eastern. Confirming takes one word and keeps spend, leads, and calls lined up on the same day.
Our default: Eastern, unless your ad account is actually set to Pacific.
**RESOLVED (July 2): Eastern (EST / America/New_York).** Josh confirmed the Meta ad account reads "New York (GMT-4)". All buckets are EST.

**4. Ready to retire the weekly commission form?**
The system now builds commission statements automatically from payments: 10% base, 15% for any rep holding a 33.3% or better close rate over a rolling two weeks. Reps review their statement and admin approves, which makes the old manual weekly form a duplicate.
Our default: auto statement only, no manual form.
**RESOLVED (July 2): no commission form.** Commission is computed automatically in the dashboard from NMI payments tied to each client; closers see a Commissions tab. Note: the specific rates (the old "10% base / 15% at 33.3% close rate over two weeks") are SUPERSEDED by the new comp plan in the July 2 section below.

**5. Is a couples enrollment one deal or two?**
Pricing runs 2 x $2,500 minus a 10 to 20% discount, so the answer changes deal counts, close rate, and average deal size.
Our default: one deal, with the partner linked on it and the full combined value on the deal.

## Policy Sign-offs

**6. How long do we keep credit-monitoring logins and SSN last 4?**
They are encrypted and access-restricted, but they are only needed until the audit is pulled. The options: purge on a set schedule after the pull, or retain longer in case of re-pulls.
Our default: purge within 30 days of the pull.

**7. Do the form option lists get your sign-off as they stand?**
The DQ reasons, lost reasons, cancellation reasons, and objection lists are already live, and you can edit them anytime in the dashboard admin. We need a quick read-through from you: approve as shipped or send us your edits.
Our default: keep the current lists and adjust in admin whenever you want.

## Data Cleanup

**8. Fold the duplicate rep entries into Josh?**
Close data produced two extra owner entries, "Joshua Steil" and "Josh / Chris", sitting next to Josh Steil. We can fold them into one record, or keep them separate if "Josh / Chris" means something distinct on your side.
Our default: fold both into Josh Steil.

**9. What are the real values on the three $0 won deals?**
Three won deals carry $0 contract value in Close, so booked revenue (currently $103,500) is understated. We will update Close and the dashboard the same day you send the amounts.
Our default: none to offer here, this one just needs your three numbers.

## Infrastructure

**10. Can we move Supabase to the Pro plan?**
Your database runs on the free plan, which has no restorable backups. Pro is about $25 per month, on your card and under your account, and we want it in place before more data flows in.
Our default: upgrade to Pro now.

**11. What is the Warm List, exactly?** The pipeline doc's Warm List definition is unfinished (placeholder text, "30 days"). Two parts to settle: the written definition, and whether opportunities should move to Warm List automatically after 30 days without activity, or only by hand. Our default: automatic after 30 idle days, reversible by any rep action.

## What Each Answer Unlocks

1. Clean consumer close rate and revenue, partners tracked on their own.
2. A close definition and commission rule that survive the new pricing.
3. Daily numbers that match your ad platform to the day.
4. Reps paid from one statement, no weekly form to chase.
5. Consistent deal counts and average deal size.
6. A firm retention policy you can state to anyone who asks.
7. Dropdowns your team trusts, so lost and DQ reporting stays meaningful.
8. Accurate per-rep stats and commission.
9. Booked revenue that reflects reality.
10. A database we can restore if anything ever goes wrong.

---

# July 2 Technical Call: confirmed decisions and new scope

Attendees: Katie (7FS), Josh Steil (technical / automation lead), Chris Steil (closer / operator), Miro (PersonalBrands.io, marketing / ads), Jimmy (delivery / onboarding). This is the current source of truth.

## Pipeline

- **Build a brand-new Close pipeline, do not migrate the existing one.** Josh creates a fresh pipeline with the agreed stages; the old pipeline stays intact as historical source. Then we move the automations and reports onto the new stages together. Reason: moving cards inside the live pipeline would arbitrarily fire automations (the "Closed Won" column fires onboarding). Target launch: mid-July (the week of July 7).
- **Split "Strategy Call Booked" into Self-Booked vs Setter-Booked** so we can report the split percentage.
- Before launch, Katie audits every automation touching Close (Cloudflare workers + Zapier) so nothing double-fires or goes silent on the new stages. End-of-week task: check all automations for duplicates against the new pipeline.
- Stage set in use (from the live Close org, ~31 statuses): Lead Opt-In, Setter Booked / Self Booked, Strategy Call Booked, Call Confirmed, No Show, Call Canceled (by Lead) / (by Team), Intake Form Needed / Submitted, Audit Complete, Call Completed, Closing, Contract Sent / Signed, Deposit, Closed Won, Won PP, Lost, DQ On Call, Follow Up Call Booked, Warm List, Interested Partner, Active Partner, Not a Fit.

## Onboarding

- **Onboarding is triggered manually by the closer** (kept this way, not automatic on a fixed %). Paid-in-full: onboarding issued immediately. Payment plans: the closer decides when, sometimes after a set % is collected (Chris intentionally waits until a higher % on plans; the % rule covers reps who release earlier).
- Mechanism: opportunity → **"Closed Won" in Close** sends an onboarding email through Close AND kicks off the GHL workflows in the **Repair Fulfillment** sub-account. The status change must also reflect on the dashboard. The new pipeline must re-trigger this from its own "Closed Won" stage.

## Commission comp plan (supersedes decision 4's rates)

- **Closers: 10% of the invoice amount (deal size, not cash collected).** The commission is locked and only released once **25% of the invoiced amount is actually collected** (applies to PIF and payment plans). So a plan can pay the closer on the 1st or 2nd installment depending on how it is structured.
- **Refunds reduce commission:** a refund tied to a client subtracts that client's commission from the rep's next check.
- **Setters: $1,000 base per month + 5%, tied to the closer's payment.** The $1,000 is earned on 25 qualified calls that showed (showed up, does not need to close). Paid once per month on the weekend. Setter and closer payouts are tied together.
- **Setter status today:** no one is actively setting. One person is in the role but only handles self-book logistics (facilitating the intake form, confirming / rescheduling appointments). For now his 5% + base + qualified-lead marker are tied to self-books, pending him doing real outbound setting.
- **No commission report form.** Commission is derived from NMI payments tied to clients; the dashboard tells us systematically whether a rep should be paid (and nets refunds). Closers see a Commissions tab.
- **Admin panel for commission business rules:** toggle per person without touching code (base yes/no, percentage per rep, the 25%-collected gate on/off). Modular design.
- **Partner commissions:** add a partner with their percentage, a dropdown to mark payee as partner vs team member, and a total-commissions-paid view.

## Payments (Stripe + NMI)

- **One unified successful-payments table for Stripe AND NMI**, with a **`product_type` field (high ticket vs low ticket)** so dashboards can filter. Disputes and refunds are backfilled from both; NMI is the processor for chargebacks/refunds.
- Each payment links back to a **contact_id** (every data entity does), so payments generated from the dashboard are always attributable.

## NMI branded payment page (pay.thecreditbrothers.com)

- Josh built an MVP (Next.js on Vercel, subdomain `pay.thecreditbrothers.com`). Purpose: reduce buying friction by offering Apple Pay / Google Pay, which GHL invoices lack.
- Flow: the closer creates an invoice from the sales dashboard, sends the link to the prospect (standard practice: the prospect pays themselves, closers rarely take the card by phone). The card used for the first installment auto-charges the remaining installments.
- The page shows item name + price + the payment schedule (dates) in plain text, then collects the first payment. Required fields: card number, expiration, zip, plus a loose identifier (name, email or phone) so we can tie it to a contact in our system.
- Also wanted: a "update card on file" link, and adopting NMI management into the dashboard (a payments/invoices screen driven by the NMI API).
- **No sales tax** (Miro's call: avoid a tax field, raise the price and say "tax included"). v1 ships without sales tax. Katie will still research whether it is legally required.
- Ownership: one 7FS dev focuses on the NMI page; scoped and assigned the week of July 7.

## Dashboard

- **Per-person profiles** (deals, opt-ins, report submissions) for granular data.
- **Leaderboard: top 2 or 3 performers, not pods** (pods need 4+ people; TCB has 3 closers).
- Follow Josh's control-panel outline for structure; widgets differ.

## Marketing / attribution

- **Start using UTMs this month via Dub.** Miro sets up Dub (Katie sends a Loom SOP); all links get UTM parameters; the dashboard tracks UTMs. Join key across Meta / Dub / our data is `utm_campaign`.
- **Meta:** likely pulled via Make or a similar automation sending daily reports into Supabase (rather than a direct API build).
- **Email campaigns** are drafted but not launched; they want the data setup in place first (so tracking must cover email too).

## Access confirmed on the call

- **Close:** the support account was made an admin (read + write) during the call.
- **GHL:** two sub-accounts. **Repair Fulfillment** holds invoices/payments; **Marketing** holds contracts. Connecting via the GHL Marketplace app using the AI@thecreditbrothers.com account (now admin).
- **Monday:** Katie added to the workspaces / boards. Data to transfer to Supabase: Sales Call Reports + Missed Call Reports (BDCR Sales workspace), the In House Payment Schedule board (deals: size + plan, high confidence), and the Credit Audits board (NAFA reports). Setter Reports board exists but is unused; no commission board (that goes to a Slack channel).
- **GitHub `TCB operations` repo** is the source of truth for all automation knowledge (Cloudflare workers + a Zapier catalog). Cloudflare/Zapier details live there.

# July 9: booking tracking policy

- **Tracking follows the admin calendar mapping; paid is an attribute, never a filter (Katie, July 9).** A booking counts in the funnel numbers when its calendar is marked Tracked in Admin > Calendars, free and paid alike. Whether the calendar charges the $25 booking fee is a visible Paid/Free attribute on Call Logs and the booked drill-down, not a condition for counting. Uncategorized calendars record but do not count until an admin maps them. Toggling Tracked or Paid re-applies to that calendar's historical calls (at rollout: 702 tracked paid, 51 tracked free, 360 untracked).
- **Unmapped Close stages no longer break the sync.** An unknown Close stage label auto-registers in Admin > Stages and the event proceeds without a stage change until it is mapped there (same counts-only-when-mapped principle as calendars).

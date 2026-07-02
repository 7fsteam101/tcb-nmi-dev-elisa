# The Credit Brothers: Decisions for Our Call

Prepared by 8 Figure Systems, June 23, 2026

The sales system is live. The ten items below are the decisions that shape what the numbers mean from here. Each one carries our recommended default, so a quick "agreed" works, or tell us what to change and we will set it that way.

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

**4. Ready to retire the weekly commission form?**
The system now builds commission statements automatically from payments: 10% base, 15% for any rep holding a 33.3% or better close rate over a rolling two weeks. Reps review their statement and admin approves, which makes the old manual weekly form a duplicate.
Our default: auto statement only, no manual form.

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

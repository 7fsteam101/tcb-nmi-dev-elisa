# Rep Forms — Catalog and Conditional Logic

Three forms, all live at /forms. Every submission is logged (duplicates detected and
superseded, so a corrected report replaces the old one without losing the trail), updates
the reporting tables, and pushes the outcome to Close (stage + a note on the lead).
All dropdown options are managed in Admin → Form Options — edit them there and the forms
change instantly, no code.

## 1. Sales Call Report — after a strategy call

The closer's main form. Conditional paths:

```
Appointment (pick from the last/next 7 days)
Rep submitting
What happened?
├── Call taken
│     Offer made? (checkbox, default yes)
│     Disposition?
│     ├── Closed (won)
│     │     → Plan sold (from Admin → Offers & Pricing)
│     │     → Total contract value ($, prefilled from the plan, editable for discounts)
│     │     → Collected today ($, 0 allowed for zero-down)
│     │     Writes: deal + payment plan v1 + full receivable schedule
│     │             (first+last-upfront rule applied) + payment + onboarding record;
│     │             contact becomes customer; opportunity -> Won PIF or Won PP
│     ├── Follow-up booked          → opportunity -> Follow Up Call Booked
│     ├── Disqualified on the call  → DQ reason (required) -> opportunity -> DQ on Call
│     └── No decision               → optional blocker (lost-reason list) -> Warm List
│     Objections raised (checkboxes, feeds the objection-breakdown numbers)
├── No show                → slot -> no_show, opportunity -> No Show
├── Cancelled by lead      → slot -> cancelled_by_lead, opportunity -> Call Canceled by Lead
└── Cancelled by team      → slot -> cancelled_by_team, opportunity -> Call Canceled by Team
Notes (free text, included in the Close note)
```

Close write-back on every path: opportunity stage + a note summarizing outcome/offer/notes.

## 2. Missed Call Report — no-shows, cancellations, reschedules

```
Appointment + Rep
What happened?
├── No show / Cancelled by lead / Cancelled by team
│     → Reason (cancellation-reason list)
│     → slot gets the terminal status, opportunity stage follows, Close updated
└── Rescheduled to a new time
      → New date and time (required)
      → old slot -> rescheduled (kept forever — this is what makes
        "5 booked today, 3 rescheduled" countable), new slot becomes current
```

Slot history is immutable: a slot that already has a final status is never edited,
a new slot is added instead.

## 3. Post-Call Notes — color after a taken call

```
Taken call (last 50) + Rep
Notes (required)
Objections that came up (checkboxes)
→ logged locally + posted as a note on the lead in Close
```

## Commission — proposed as a view, not a form

The old weekly Commission Report form existed because commission was computed by hand.
Here every payment already computes its commission (rate frozen at collection time,
10%/15% by the rolling 2-week close rate), so the proposal is: reps REVIEW an
auto-generated commission statement (Reps & Commission page) and an admin approves it
for payroll — no manual submission, no double-submit bug. If the team still wants a
manual submission step, say so and it becomes form #4.

## Changing the forms

- Dropdown options (reasons, objections, sources): Admin → Form Options
- Plans and prices on the close path: Admin → Offers & Pricing
- Who appears in the Rep dropdown: Admin → Team
- New fields / structural changes: code change in `dashboard/app/(app)/forms/` — quick,
  since each form is one file plus one action.

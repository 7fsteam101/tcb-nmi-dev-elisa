# Start here: developer onboarding for The Credit Brothers sales system

Hi, and welcome. This is the plain-English version of everything, written so you
can read it top to bottom, understand what we are building and where we are, and
then get your own machine set up to continue. It also doubles as the brief your
Claude Code should read first (see the last section).

## First, how this handoff actually works

We are not sharing one Claude Code brain. Claude Code runs on each person's own
computer against their own local copy of the code. Your Claude Code will not
remember any of the conversations Katie and Claude had. That is fine, because all
of the real context lives in THIS repository: the code, the commit history (every
commit message is a paragraph explaining what changed and why), and a handful of
docs. When you open Claude Code inside your cloned copy of this repo and point it
at these docs, it rebuilds the full picture. That is the mechanism. There is
nothing to "transfer" from Katie's session.

## The 90-second story: what we are building and why

The Credit Brothers (TCB) run a credit-repair business. The funnel is: someone
opts in from an ad, books a paid $25 strategy call, and on that call a closer sells
them into the main program (roughly $2,500 to $3,500, often on a payment plan).

Their tools were scattered across a lot of systems that did not talk to each other,
so nobody had one trustworthy view of the numbers. We are building that view: a
Supabase (Postgres) database plus a Next.js dashboard hosted on Vercel that pulls
everything together (Close CRM, two GoHighLevel sub-accounts, NMI and Stripe for
payments, Monday, Meta ads, Dub links) into one source of truth, with real
reporting on the funnel, the reps, the money, and the pipeline.

Your piece is the **NMI payment part**: a branded checkout page where a closer
generates a payment link, the customer pays (card, Apple Pay, Google Pay), and
installment plans charge automatically. It is already built and working in test
mode. Your job is to take it to production. More on that below.

## The people (who to talk to about what)

On the client (TCB) side:
- **Josh Steil** is their technical and automation lead. He owns the Cloudflare
  workers, the GoHighLevel setup, the onboarding automations, and the "TCB
  operations" GitHub repo that documents all of their automations. He is your main
  technical counterpart. If you need to know how something on their side works, it
  is either in that repo or Josh knows.
- **Chris Steil** is a closer and operator. He owns some of the Monday boards
  (like the payment schedule board).
- **Miro** (PersonalBrands.io) runs marketing, the ads, and the Dub / UTM setup.
- **Jimmy** works on the delivery / client-onboarding side.

On our side:
- **Katie** is the project lead. You (logging in as the shared 7 Figure Systems
  account, `7fsteam101`) are the dev picking up the NMI build.

## The systems and where their data lives

- **Close CRM** is the sales pipeline (opportunities, contacts). We read from it and
  write back to it, and it is already live in our system.
- **GoHighLevel** has two sub-accounts: **Marketing** (the funnel front end and the
  contracts) and **Repair Fulfillment** (invoices/payments and the onboarding
  workflows). Not fully connected yet.
- **NMI** is the main payment processor (program payments, chargebacks, refunds).
  **Stripe** handles the small $25 booking fee. Your work is on the NMI side.
- **Monday** holds historical data (sales reports, the payment schedule, credit
  audits). One-time import, not a live sync.
- **Supabase** is our database. **Vercel** hosts the dashboard. **GitHub**
  (`github.com/7fsDev/tcb-sales-system`, the 7FS org) is this repo.

## What has been built so far, in plain language

You do not need to rebuild any of this. It is here so you understand the ground you
are standing on:
- The **dashboard** itself: overview, funnel, call logs, contacts, reps, revenue,
  receivables, commissions, forms, and drill-downs, with a colored, Airtable-style
  look.
- **Close CRM is live** two ways: we import their history and we react to changes in
  real time, and our forms write back to Close.
- The **database has been hardened**: security policies, performance indexes, and a
  data-integrity pass so the numbers are trustworthy.
- Every data record (an opportunity, a call, a deal, a payment) has its **own detail
  view** that opens as a panel, like Airtable.
- **Your area, the NMI checkout, is fully built and tested in NMI test mode**: link
  generation, the branded pay page with card and Apple/Google Pay, taking the first
  payment and vaulting the card, scheduling the rest, confirming each charge back
  into the database, custom per-installment plans, and a card-update page.

The commit history (run `git log` in the repo) reads as a timeline of all of this.

## Where we left off (the honest status)

- The dashboard is deployed and working.
- Close is live. GHL, Meta, Monday, Dub are built but waiting on credentials /
  install steps on the client side.
- **The NMI checkout works end to end in TEST mode** (we ran real sandbox charges
  through it). It is NOT live yet. Going live is a short list of configuration
  steps, not more building. That list is your job.

## Your job: take the NMI checkout to production

The full technical spec is in `NMI-PAGE-BUILD-SCOPE.md` (read the "BUILD STATUS"
section at the top first) and `NMI-PAYMENT-LINKS.md` (how NMI's API works). In plain
terms, going live means:
1. Get the NMI **tokenization key** from the NMI Merchant Portal and set it, so the
   real hosted card fields and the Apple/Google Pay buttons appear (right now the
   page uses a test-card form).
2. Switch from the sandbox key to the **live** NMI key.
3. Turn on the **webhook** in NMI (so scheduled installments confirm back to us) and
   set its signing key.
4. Verify **Apple Pay** on the `pay.thecreditbrothers.com` domain.
5. Point that **domain** at the app.
6. Confirm with the processor whether wallets can be used for installment plans, and
   handle the zero-down plan case.

Each of these is spelled out in `NMI-PAGE-BUILD-SCOPE.md`.

## Setting up your machine (your own Claude Code, your own local files)

1. Log into GitHub as `7fsteam101` (you have those logins). You already have write
   access to the repo.
2. Clone it: `git clone https://github.com/7fsDev/tcb-sales-system.git`
3. `cd tcb-sales-system/dashboard` and run `npm install`.
4. Create `dashboard/.env.local`. For NMI development you mainly need:
   - `DATABASE_URL` = the Supabase connection string (ask Katie for it, or use your
     own Supabase project for dev).
   - `NMI_SECURITY_KEY=6457Thfj624V5r7WUwc5v6a68Zsd6YEm` (the public NMI sandbox key;
     this is what puts the app in test mode, and it is safe to use).
   - `AUTH_DISABLED=true` for local dev so you are not stopped at a login screen.
   Never commit `.env.local`; it is gitignored.
5. Run `npm run dev` and open `http://localhost:3000`.
6. Work on a branch (for example `git checkout -b nmi-prod`), commit as you go, and
   open a pull request rather than pushing straight to `main`.
7. Read `AGENTS.md` in the `dashboard` folder: this is Next.js 16, which differs from
   older versions, and that file plus `lib/db.ts` explain the conventions.

If you want to run everything on your own cloud accounts instead of the shared ones,
you can: point `DATABASE_URL` at your own Supabase project (run the migrations in
`supabase/migrations` against it), keep the NMI sandbox key for testing, and deploy
to your own Vercel project. For the real production launch we will use the shared
Vercel and the live NMI keys, which Katie will provide.

## Access you will need from Katie

- The repo: done (you have write access as `7fsteam101`).
- A `DATABASE_URL` for local development.
- For the production launch only: the NMI Merchant Portal (tokenization key, webhook
  signing key, Apple Pay), and Vercel deploy access.

## The docs map (what to read, in order)

1. **This file** for the story and setup.
2. `NMI-PAGE-BUILD-SCOPE.md` for exactly what to build and the go-live checklist.
3. `NMI-PAYMENT-LINKS.md` for how NMI's API works (Collect.js, vault, installments,
   webhooks).
4. `CLIENT-DECISIONS.md` and `CONNECTIONS-TRIGGERS.md` for the wider product and
   integration decisions, if you want the full background.

## Paste this into your Claude Code the first time you open the repo

> I am a developer picking up The Credit Brothers sales system. Read DEV-ONBOARDING.md
> first (the story and my setup), then NMI-PAGE-BUILD-SCOPE.md and
> NMI-PAYMENT-LINKS.md, plus the code in dashboard/lib/nmi.ts, dashboard/lib/nmi-links.ts,
> and dashboard/app/pay/[token]/. The NMI branded checkout is already built and tested
> in NMI test mode; my job is to take it to production by working the "What is left" /
> go-live checklist, not to rebuild what works. Follow dashboard/AGENTS.md (this is
> Next.js 16) and the postgres pooler rules in dashboard/lib/db.ts. Start by getting
> the app running locally against the NMI sandbox and confirming the test-mode flow,
> then walk me through the go-live steps one at a time.

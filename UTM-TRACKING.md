# Tracking UTMs on the Dashboard: setup and how it flows

How every lead, contact, booked call, and deal ends up carrying the campaign that
produced it, so the dashboard can show one row per campaign (Spend, Leads, Booked,
Taken, Won, Cash, plus CPL / cost-per-booked / CPA / ROAS). The join key across
every source is `utm_campaign`.

## The end-to-end flow

1. A **Dub short link** (one per placement) carries the UTMs and redirects to the
   funnel landing page, passing `utm_source`, `utm_medium`, `utm_campaign`,
   `utm_content`, `utm_term`, and Dub's own `dub_id`.
2. The **landing page forwards those into the GHL opt-in form as hidden fields**.
3. The **GHL form submission** hits our webhook and writes a `sales.opt_in` row
   with `source_channel`, `source_campaign` (= the utm_campaign), the full `utm`
   string, and `dub_link_id`.
4. The dashboard's **Campaign Performance report** groups each contact by their
   earliest opt-in campaign (first touch) and joins Meta spend on
   `campaign_name = utm_campaign`.

## What is already ready (verified 2026-07-05)

- **Schema:** `sales.opt_in` has `source_channel`, `source_campaign`, `utm`,
  `dub_link_id`, `form_id`, `ghl_marketing_id`. `sales.call` additionally has
  `booking_source_channel` + `booking_utm` / `booking_source_campaign` /
  `booking_dub_link_id` for per-booking attribution later.
- **Capture:** the GHL form-submission normalizer now writes `source_campaign`,
  `utm`, AND `dub_link_id` (the Dub id was previously being dropped; fixed today).
- **Report:** `lib/kpi-campaign.ts` builds the one-row-per-campaign funnel and joins
  Meta on `campaign_name = utm_campaign`. Attribution uses first / last / converting
  touch from opt-ins.
- **Per-contact:** each contact profile shows its acquisition source and campaign.

## What still has to be set up (mostly on the marketing side)

1. **Hidden fields on every GHL opt-in form:** `utm_source`, `utm_medium`,
   `utm_campaign`, `utm_content`, `utm_term`, plus `dub_id`. Without these, opt-ins
   land as "(unattributed)". Owner: Miro / GHL.
2. **Dub links carry the UTMs:** every placement (each ad, each bio link, each
   email link) gets a Dub short link with its UTMs baked in. Dub passes them to the
   landing page, which forwards them into the form. Owner: Miro (Katie sends a Loom SOP).
3. **Naming convention:** `utm_campaign` must be identical across Meta (the campaign
   name), the Dub link's campaign, and the form value, or the three sources will not
   line up in one row. Enforce this with the media buyer. This is the single most
   common reason a campaign report looks half-empty.
4. **(Optional) Dub Analytics API (Dub Pro):** a read key in Connections, Dub pulls
   top-of-funnel click volume by campaign. Attribution works fully without it; you
   only lose the raw click count.

## Details that matter

- **Timezone: EST** (confirmed July 2). Meta spend and our funnel align to the same
  Eastern day, so daily campaign rows are apples to apples.
- **Email campaigns** are drafted but not launched (data setup first). When they go
  live, the email links must also carry UTMs (via Dub) so email leads attribute the
  same way as ads.
- **Current state:** there are 0 opt-ins in the database today because GHL is not
  connected yet. The moment GHL is connected and the hidden fields + Dub links are in
  place, attribution flows automatically. Nothing else on the dashboard side needs
  building for UTM tracking to work.

## Quick test once it is live

Submit the funnel form through a Dub link that has UTMs, then open the contact in the
dashboard: the opt-in should show the campaign, and that campaign should appear as its
own row in Campaign Performance. If it shows "(unattributed)", the hidden fields are
missing on the form or the Dub link is not passing UTMs.

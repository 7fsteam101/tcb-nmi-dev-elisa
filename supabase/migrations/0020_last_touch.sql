-- =====================================================================
-- 0020: Last-touch attribution (Katie 2026-07-02: track first / last /
-- converting source). first_touch_channel and converting_touch_channel exist;
-- this adds the third. Maintained by the sync (automation logic, not triggers):
--   first_touch      = the source of the FIRST opt-in (set once, never changed)
--   last_touch       = the source of the MOST RECENT touch (opt-in or booking),
--                      updated while the opportunity is open, frozen at close
--   converting_touch = the source of the booking that led to the close
-- =====================================================================

alter table sales.opportunity add column last_touch_channel text;
comment on column sales.opportunity.last_touch_channel is 'The most recent touch source (opt-in or booking) while the opportunity was open; frozen when it closes. first_touch is set once at the first opt-in; converting_touch is the source of the booking that converted.';

-- End of migration 0020.

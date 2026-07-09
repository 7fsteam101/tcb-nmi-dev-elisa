-- =====================================================================
-- 0042: tracking follows the admin's calendar mapping; paid is an attribute.
-- Policy (Katie, 2026-07-09): a call counts as booked when its calendar is
-- TRACKED (calendar_map.active) regardless of free/paid. Paid vs free becomes
-- a visible field (call.is_paid_booking), not a filter.
--   call.is_booking        -> "counts as a tracked booking" (calendar active)
--   call.is_paid_booking   -> the paid attribute (from calendar_map.is_booking)
--   calendar_map.is_booking-> reinterpreted: "this calendar takes the PAID fee"
-- =====================================================================

alter table sales.call add column if not exists is_paid_booking boolean;
comment on column sales.call.is_paid_booking is
  'Whether this booking came through a paid ($25 fee) calendar. Attribute only; never filters calls out of tracking.';
comment on column sales.call.is_booking is
  'Counts as a tracked booking: the calendar is admin-mapped active. Uncategorized calendars record with false until mapped.';
comment on column sync.calendar_map.is_booking is
  'Reinterpreted 2026-07-09: TRUE = this calendar takes the paid booking fee. Tracking is controlled by active, not this flag.';

-- backfill from the calendar mapping: tracked = active; paid = calendar is_booking
update sales.call c set
  is_booking = cm.active,
  is_paid_booking = case when cm.active then cm.is_booking else null end
from sync.calendar_map cm
where c.calendar_map_id = cm.id;

-- calls with no calendar linkage (Close-era history, manual) stay tracked; paid unknown
update sales.call set is_paid_booking = null where calendar_map_id is null and is_paid_booking is null;

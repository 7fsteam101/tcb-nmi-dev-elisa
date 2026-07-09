-- 0044: distinguish "admin decided off" from "never reviewed" so new calendars
-- that nobody categorized are impossible to miss. Baseline: everything existing
-- is blessed (the whitelist was deliberate); only NEW arrivals need attention.
alter table sync.calendar_map add column if not exists reviewed_at timestamptz;
comment on column sync.calendar_map.reviewed_at is 'Set by any admin action on the row. NULL = never reviewed -> surfaces in the needs-attention banner.';
update sync.calendar_map set reviewed_at = now() where reviewed_at is null;

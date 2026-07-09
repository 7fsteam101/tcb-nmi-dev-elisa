-- 0048: per-user notes access (Katie, July 10): admins choose on each user
-- whether contact notes (and their attachments) are visible.
alter table core.app_user add column if not exists can_view_notes boolean not null default true;
comment on column core.app_user.can_view_notes is 'Whether this user sees contact notes + attachments (toggled in Admin, Users & Access).';

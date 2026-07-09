-- 0047: attachments on contact notes (Katie, July 9). Files live in the DB as
-- bytea (5MB cap enforced in the action) and stream through an authed route;
-- no external storage dependency.
create table if not exists core.note_attachment (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references core.contact_note(id) on delete cascade,
  filename text not null,
  mime text not null default 'application/octet-stream',
  size_bytes integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
comment on table core.note_attachment is 'Files attached to contact notes (bytea, <=5MB each), streamed via /api/attachments/[id]. Cascade-deletes with the note.';
create index if not exists idx_note_attachment_note_fk on core.note_attachment (note_id);
alter table core.note_attachment enable row level security;
grant all on core.note_attachment to service_role;

-- =====================================================================
-- 0006: A contact can have multiple opportunities — mirror Close (Katie 2026-06-27).
--
-- Contact : Opportunity = 1:N. A person buys one thing, then comes back and buys
-- more, so they accumulate opportunities over time, and more than one can be open
-- at once. Close allows multiple opportunities per lead, and an opportunity a user
-- creates by hand in Close must sync straight through. So we drop the
-- "one open opportunity per contact" unique index. "One active opportunity" is now
-- only the automation's working assumption, enforced in the sync logic, never by
-- the database.
-- =====================================================================

drop index if exists public.uq_open_opp_per_contact;

comment on table public.opportunity is
  'A sales-cycle instance and the main reporting unit. Contact : Opportunity = 1:N — a contact can have multiple opportunities over time (repeat purchases) and more than one may be open at once; the database mirrors Close. The automation works with one active opportunity at a time and never OVERWRITES a won opportunity (it creates a new one for new activity), but that is sync/automation logic, NOT a database rule — an opportunity created by hand in Close syncs straight through.';

-- End of migration 0006.

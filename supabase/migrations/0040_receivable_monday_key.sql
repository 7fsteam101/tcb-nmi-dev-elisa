-- 0040: unique key for the Monday installment import (receivable upserts
-- arbitrate on monday_payment_schedule_id; column existed without an index).
create unique index if not exists uq_receivable_monday_item
  on finance.receivable (monday_payment_schedule_id) where monday_payment_schedule_id is not null;

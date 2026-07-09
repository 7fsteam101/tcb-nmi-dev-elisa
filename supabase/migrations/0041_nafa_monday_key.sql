-- 0041: unique key for the Monday credit-audits import (nafa upserts arbitrate
-- on monday_credit_audit_item; column existed without a unique index).
create unique index if not exists uq_nafa_monday_item
  on credit.nafa (monday_credit_audit_item) where monday_credit_audit_item is not null;

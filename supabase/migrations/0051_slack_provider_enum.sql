-- 0051: 'slack' joins the provider enum (0050 already ran on the live DB, so
-- the alter ships separately; PG 15 allows ADD VALUE in a transaction as long
-- as the value is not used in the same transaction, and it is not).
alter type sync.provider add value if not exists 'slack';

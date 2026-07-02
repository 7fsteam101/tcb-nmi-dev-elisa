# postgres

## Tables

| Name | Columns | Comment | Type |
| ---- | ------- | ------- | ---- |
| [extensions.pg_stat_statements_info](extensions.pg_stat_statements_info.md) | 2 |  | VIEW |
| [extensions.pg_stat_statements](extensions.pg_stat_statements.md) | 49 |  | VIEW |
| [auth.users](auth.users.md) | 35 | Auth: Stores user login data within a secure schema. | BASE TABLE |
| [auth.refresh_tokens](auth.refresh_tokens.md) | 9 | Auth: Store of tokens used to refresh JWT tokens once they expire. | BASE TABLE |
| [auth.instances](auth.instances.md) | 5 | Auth: Manages users across multiple sites. | BASE TABLE |
| [auth.audit_log_entries](auth.audit_log_entries.md) | 5 | Auth: Audit trail for user actions. | BASE TABLE |
| [auth.schema_migrations](auth.schema_migrations.md) | 1 | Auth: Manages updates to the auth system. | BASE TABLE |
| [vault.secrets](vault.secrets.md) | 8 | Table with encrypted `secret` column for storing sensitive information on disk. | BASE TABLE |
| [vault.decrypted_secrets](vault.decrypted_secrets.md) | 9 |  | VIEW |
| [auth.identities](auth.identities.md) | 9 | Auth: Stores identities associated to a user. | BASE TABLE |
| [auth.sessions](auth.sessions.md) | 15 | Auth: Stores session data associated to a user. | BASE TABLE |
| [auth.mfa_factors](auth.mfa_factors.md) | 13 | auth: stores metadata about factors | BASE TABLE |
| [auth.mfa_challenges](auth.mfa_challenges.md) | 7 | auth: stores metadata about challenge requests made | BASE TABLE |
| [auth.mfa_amr_claims](auth.mfa_amr_claims.md) | 5 | auth: stores authenticator method reference claims for multi factor authentication | BASE TABLE |
| [auth.sso_providers](auth.sso_providers.md) | 5 | Auth: Manages SSO identity provider information; see saml_providers for SAML. | BASE TABLE |
| [auth.sso_domains](auth.sso_domains.md) | 5 | Auth: Manages SSO email address domain mapping to an SSO Identity Provider. | BASE TABLE |
| [auth.saml_providers](auth.saml_providers.md) | 9 | Auth: Manages SAML Identity Provider connections. | BASE TABLE |
| [auth.saml_relay_states](auth.saml_relay_states.md) | 8 | Auth: Contains SAML Relay State information for each Service Provider initiated login. | BASE TABLE |
| [auth.flow_state](auth.flow_state.md) | 17 | Stores metadata for all OAuth/SSO login flows | BASE TABLE |
| [auth.one_time_tokens](auth.one_time_tokens.md) | 7 |  | BASE TABLE |
| [auth.oauth_clients](auth.oauth_clients.md) | 13 |  | BASE TABLE |
| [auth.oauth_authorizations](auth.oauth_authorizations.md) | 17 |  | BASE TABLE |
| [auth.oauth_consents](auth.oauth_consents.md) | 6 |  | BASE TABLE |
| [auth.oauth_client_states](auth.oauth_client_states.md) | 4 | Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client. | BASE TABLE |
| [auth.custom_oauth_providers](auth.custom_oauth_providers.md) | 25 |  | BASE TABLE |
| [auth.webauthn_credentials](auth.webauthn_credentials.md) | 14 |  | BASE TABLE |
| [auth.webauthn_challenges](auth.webauthn_challenges.md) | 6 |  | BASE TABLE |
| [realtime.schema_migrations](realtime.schema_migrations.md) | 2 |  | BASE TABLE |
| [realtime.subscription](realtime.subscription.md) | 9 |  | BASE TABLE |
| [realtime.messages](realtime.messages.md) | 9 |  | BASE TABLE |
| [storage.migrations](storage.migrations.md) | 4 |  | BASE TABLE |
| [storage.buckets](storage.buckets.md) | 11 |  | BASE TABLE |
| [storage.objects](storage.objects.md) | 12 |  | BASE TABLE |
| [storage.s3_multipart_uploads](storage.s3_multipart_uploads.md) | 10 |  | BASE TABLE |
| [storage.s3_multipart_uploads_parts](storage.s3_multipart_uploads_parts.md) | 10 |  | BASE TABLE |
| [storage.buckets_analytics](storage.buckets_analytics.md) | 7 |  | BASE TABLE |
| [storage.buckets_vectors](storage.buckets_vectors.md) | 4 |  | BASE TABLE |
| [storage.vector_indexes](storage.vector_indexes.md) | 9 |  | BASE TABLE |
| [supabase_migrations.schema_migrations](supabase_migrations.schema_migrations.md) | 3 |  | BASE TABLE |
| [core.cancellation_reason](core.cancellation_reason.md) | 7 |  | BASE TABLE |
| [core.dq_reason](core.dq_reason.md) | 7 |  | BASE TABLE |
| [core.source_channel](core.source_channel.md) | 7 |  | BASE TABLE |
| [core.credit_account_type](core.credit_account_type.md) | 7 |  | BASE TABLE |
| [core.call_outcome](core.call_outcome.md) | 7 |  | BASE TABLE |
| [core.objection_type](core.objection_type.md) | 7 |  | BASE TABLE |
| [sales.rep](sales.rep.md) | 11 |  | BASE TABLE |
| [core.contact](core.contact.md) | 18 | One real person = the Close "Lead" (1:1). Extra emails/phones live in contact_identifier. | BASE TABLE |
| [core.contact_identifier](core.contact_identifier.md) | 8 | A person's extra emails/phones. Append-only, never overwrite; match across all when deduping. | BASE TABLE |
| [marketing.offer](marketing.offer.md) | 7 |  | BASE TABLE |
| [marketing.pricing_plan](marketing.pricing_plan.md) | 11 |  | BASE TABLE |
| [sales.opportunity](sales.opportunity.md) | 20 | A sales-cycle instance and the main reporting unit. Contact : Opportunity = 1:N — a contact can have multiple opportunities over time (repeat purchases) and more than one may be open at once; the database mirrors Close. The automation works with one active opportunity at a time and never OVERWRITES a won opportunity (it creates a new one for new activity), but that is sync/automation logic, NOT a database rule — an opportunity created by hand in Close syncs straight through. | BASE TABLE |
| [sales.opt_in](sales.opt_in.md) | 17 | A marketing lead-form submission. Carries the source that feeds first-touch. | BASE TABLE |
| [credit.intake_submission](credit.intake_submission.md) | 13 | ⚠️ PII (idiq/msiq logins + SSN-last-4). Ciphertext only, RLS-locked to service role, purge after use. | BASE TABLE |
| [credit.nafa](credit.nafa.md) | 22 | One credit-report pull rendered as a NAFA. 1:N per opportunity (history kept); is_canonical = the latest valid. | BASE TABLE |
| [sales.call](sales.call.md) | 36 | All calls in one table (type = readiness/strategy/follow_up). The strategy call is the booking; funnel KPIs filter type=strategy. | BASE TABLE |
| [sales.appointment](sales.appointment.md) | 12 | One scheduled slot of a strategy booking. Each reschedule = a new row; terminal slots are immutable. Reschedule = status=rescheduled. | BASE TABLE |
| [sales.deal](sales.deal.md) | 16 | A won opportunity + terms. Always one offer per deal. status never deleted. | BASE TABLE |
| [sales.contract](sales.contract.md) | 12 |  | BASE TABLE |
| [finance.payment_plan](finance.payment_plan.md) | 10 | Versioned schedule. A re-split creates a new version + new receivables (the #1 bug fix); old version not-current. | BASE TABLE |
| [finance.receivable](finance.receivable.md) | 13 | One scheduled installment of a payment-plan version. Drives pipeline value, projected cash, delinquency, collection rate. | BASE TABLE |
| [finance.successful_payment](finance.successful_payment.md) | 15 | A cleared transaction. Cash collected = NMI gross, excludes booking_25, net of reversals. | BASE TABLE |
| [finance.reversal](finance.reversal.md) | 10 |  | BASE TABLE |
| [finance.commission_plan](finance.commission_plan.md) | 13 |  | BASE TABLE |
| [finance.commission_tier](finance.commission_tier.md) | 7 |  | BASE TABLE |
| [finance.commission_payout](finance.commission_payout.md) | 12 |  | BASE TABLE |
| [finance.commission_line](finance.commission_line.md) | 11 | Per commissionable payment, auto-calculated, rate frozen. Its own table so one payment can split across reps and clawbacks can exist with no payment. | BASE TABLE |
| [marketing.ad_spend](marketing.ad_spend.md) | 20 | Meta insights, grain = (date x ad_id). Trailing-window upsert by pulled_at for restatements. Lock the ad-account timezone first. | BASE TABLE |
| [delivery.fulfilment](delivery.fulfilment.md) | 14 | Delivery of ONE purchased service (1:1 deal). The client is the contact; contact:deal = 1:N. Created when the opportunity reaches stage won_pif or won_pp (the onboarding trigger). | BASE TABLE |
| [sales.report_submission](sales.report_submission.md) | 13 |  | BASE TABLE |
| [sales.objection](sales.objection.md) | 7 |  | BASE TABLE |
| [sync.connections](sync.connections.md) | 13 | One row per connected account. Adding an account is a new row — this is what makes the connectors dynamic / multi-account. One GHL agency can have many location rows. OAuth tokens live in Supabase Vault (token_secret_ref), never inline. | BASE TABLE |
| [sync.sync_runs](sync.sync_runs.md) | 12 |  | BASE TABLE |
| [sync.raw_events](sync.raw_events.md) | 11 | Idempotent landing zone for raw provider payloads. The UNIQUE key makes a re-delivered webhook or a re-pulled record a no-op. | BASE TABLE |
| [sync.writeback_queue](sync.writeback_queue.md) | 13 | Two-way sync. A dashboard edit (e.g. move an opportunity stage) lands here, then a writeback worker pushes it to Close / GHL. Curated allow-list via `enabled`; echo-loop guard via `origin`, so the write-back does not come straight back through the inbound sync. | BASE TABLE |
| [core.lost_reason](core.lost_reason.md) | 7 | Why a QUALIFIED lead did not convert (distinct from dq_reason, which is why a lead was screened out). Referenced by sales.opportunity.lost_reason_id. | BASE TABLE |
| [core.app_user](core.app_user.md) | 11 | Dashboard login accounts (scrypt password hashes). Verified server-side only; no client access. rep_id links a login to their sales.rep record so forms pre-fill. | BASE TABLE |
| [core.app_setting](core.app_setting.md) | 4 | App-level configuration (key/value). e.g. demo_mode, report timezone. | BASE TABLE |
| [sync.calendar_map](sync.calendar_map.md) | 9 | GHL calendar -> call type mapping. The GHL sync categorizes every appointment through this; edited in the admin panel. Unmapped calendars default to strategy and appear here automatically for review. | BASE TABLE |

## Stored procedures and functions

| Name | ReturnType | Arguments | Type |
| ---- | ------- | ------- | ---- |
| pgbouncer.get_auth | record | p_usename text | FUNCTION |
| extensions.pg_stat_statements_info | record | OUT dealloc bigint, OUT stats_reset timestamp with time zone | FUNCTION |
| extensions.pg_stat_statements | record | showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT shared_blk_read_time double precision, OUT shared_blk_write_time double precision, OUT local_blk_read_time double precision, OUT local_blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision, OUT jit_deform_count bigint, OUT jit_deform_time double precision, OUT stats_since timestamp with time zone, OUT minmax_stats_since timestamp with time zone | FUNCTION |
| extensions.pg_stat_statements_reset | timestamptz | userid oid DEFAULT 0, dbid oid DEFAULT 0, queryid bigint DEFAULT 0, minmax_only boolean DEFAULT false | FUNCTION |
| extensions.uuid_nil | uuid |  | FUNCTION |
| extensions.uuid_ns_dns | uuid |  | FUNCTION |
| extensions.uuid_ns_url | uuid |  | FUNCTION |
| extensions.uuid_ns_oid | uuid |  | FUNCTION |
| extensions.uuid_ns_x500 | uuid |  | FUNCTION |
| extensions.uuid_generate_v1 | uuid |  | FUNCTION |
| extensions.uuid_generate_v1mc | uuid |  | FUNCTION |
| extensions.uuid_generate_v3 | uuid | namespace uuid, name text | FUNCTION |
| extensions.uuid_generate_v4 | uuid |  | FUNCTION |
| extensions.uuid_generate_v5 | uuid | namespace uuid, name text | FUNCTION |
| extensions.digest | bytea | text, text | FUNCTION |
| extensions.digest | bytea | bytea, text | FUNCTION |
| extensions.hmac | bytea | text, text, text | FUNCTION |
| extensions.hmac | bytea | bytea, bytea, text | FUNCTION |
| extensions.crypt | text | text, text | FUNCTION |
| extensions.gen_salt | text | text | FUNCTION |
| extensions.gen_salt | text | text, integer | FUNCTION |
| extensions.encrypt | bytea | bytea, bytea, text | FUNCTION |
| extensions.decrypt | bytea | bytea, bytea, text | FUNCTION |
| extensions.encrypt_iv | bytea | bytea, bytea, bytea, text | FUNCTION |
| extensions.decrypt_iv | bytea | bytea, bytea, bytea, text | FUNCTION |
| extensions.gen_random_bytes | bytea | integer | FUNCTION |
| extensions.gen_random_uuid | uuid |  | FUNCTION |
| extensions.pgp_sym_encrypt | bytea | text, text | FUNCTION |
| extensions.pgp_sym_encrypt_bytea | bytea | bytea, text | FUNCTION |
| extensions.pgp_sym_encrypt | bytea | text, text, text | FUNCTION |
| extensions.pgp_sym_encrypt_bytea | bytea | bytea, text, text | FUNCTION |
| extensions.pgp_sym_decrypt | text | bytea, text | FUNCTION |
| extensions.pgp_sym_decrypt_bytea | bytea | bytea, text | FUNCTION |
| extensions.pgp_sym_decrypt | text | bytea, text, text | FUNCTION |
| extensions.pgp_sym_decrypt_bytea | bytea | bytea, text, text | FUNCTION |
| extensions.pgp_pub_encrypt | bytea | text, bytea | FUNCTION |
| extensions.pgp_pub_encrypt_bytea | bytea | bytea, bytea | FUNCTION |
| extensions.pgp_pub_encrypt | bytea | text, bytea, text | FUNCTION |
| extensions.pgp_pub_encrypt_bytea | bytea | bytea, bytea, text | FUNCTION |
| extensions.pgp_pub_decrypt | text | bytea, bytea | FUNCTION |
| extensions.pgp_pub_decrypt_bytea | bytea | bytea, bytea | FUNCTION |
| extensions.pgp_pub_decrypt | text | bytea, bytea, text | FUNCTION |
| extensions.pgp_pub_decrypt_bytea | bytea | bytea, bytea, text | FUNCTION |
| extensions.pgp_pub_decrypt | text | bytea, bytea, text, text | FUNCTION |
| extensions.pgp_pub_decrypt_bytea | bytea | bytea, bytea, text, text | FUNCTION |
| extensions.pgp_key_id | text | bytea | FUNCTION |
| extensions.armor | text | bytea | FUNCTION |
| extensions.armor | text | bytea, text[], text[] | FUNCTION |
| extensions.dearmor | bytea | text | FUNCTION |
| extensions.pgp_armor_headers | record | text, OUT key text, OUT value text | FUNCTION |
| auth.uid | uuid |  | FUNCTION |
| auth.role | text |  | FUNCTION |
| auth.email | text |  | FUNCTION |
| extensions.grant_pg_cron_access | event_trigger |  | FUNCTION |
| extensions.grant_pg_net_access | event_trigger |  | FUNCTION |
| extensions.pgrst_ddl_watch | event_trigger |  | FUNCTION |
| extensions.pgrst_drop_watch | event_trigger |  | FUNCTION |
| extensions.grant_pg_graphql_access | event_trigger |  | FUNCTION |
| extensions.set_graphql_placeholder | event_trigger |  | FUNCTION |
| vault._crypto_aead_det_encrypt | bytea | message bytea, additional bytea, key_id bigint, context bytea DEFAULT '\x7067736f6469756d'::bytea, nonce bytea DEFAULT NULL::bytea | FUNCTION |
| vault._crypto_aead_det_decrypt | bytea | message bytea, additional bytea, key_id bigint, context bytea DEFAULT '\x7067736f6469756d'::bytea, nonce bytea DEFAULT NULL::bytea | FUNCTION |
| vault._crypto_aead_det_noncegen | bytea |  | FUNCTION |
| vault.create_secret | uuid | new_secret text, new_name text DEFAULT NULL::text, new_description text DEFAULT ''::text, new_key_id uuid DEFAULT NULL::uuid | FUNCTION |
| vault.update_secret | void | secret_id uuid, new_secret text DEFAULT NULL::text, new_name text DEFAULT NULL::text, new_description text DEFAULT NULL::text, new_key_id uuid DEFAULT NULL::uuid | FUNCTION |
| graphql_public.graphql | jsonb | "operationName" text DEFAULT NULL::text, query text DEFAULT NULL::text, variables jsonb DEFAULT NULL::jsonb, extensions jsonb DEFAULT NULL::jsonb | FUNCTION |
| auth.jwt | jsonb |  | FUNCTION |
| realtime.subscription_check_filters | trigger |  | FUNCTION |
| realtime.quote_wal2json | text | entity regclass | FUNCTION |
| realtime.check_equality_op | bool | op realtime.equality_op, type_ regtype, val_1 text, val_2 text | FUNCTION |
| realtime.cast | jsonb | val text, type_ regtype | FUNCTION |
| realtime.to_regrole | regrole | role_name text | FUNCTION |
| realtime.apply_rls | wal_rls | wal jsonb, max_record_bytes integer DEFAULT (1024 * 1024) | FUNCTION |
| realtime.is_visible_through_filters | bool | columns realtime.wal_column[], filters realtime.user_defined_filter[] | FUNCTION |
| realtime.build_prepared_statement_sql | text | prepared_statement_name text, entity regclass, columns realtime.wal_column[] | FUNCTION |
| realtime.topic | text |  | FUNCTION |
| realtime.send | void | payload jsonb, event text, topic text, private boolean DEFAULT true | FUNCTION |
| realtime.broadcast_changes | void | topic_name text, event_name text, operation text, table_name text, table_schema text, new record, old record, level text DEFAULT 'ROW'::text | FUNCTION |
| realtime.wal2json_escape_identifier | text | name text | FUNCTION |
| realtime.list_changes | record | publication name, slot_name name, max_changes integer, max_record_bytes integer | FUNCTION |
| realtime.send_binary | void | payload bytea, event text, topic text, private boolean DEFAULT true | FUNCTION |
| storage.foldername | _text | name text | FUNCTION |
| storage.filename | text | name text | FUNCTION |
| storage.extension | text | name text | FUNCTION |
| storage.get_size_by_bucket | record |  | FUNCTION |
| storage.search | record | prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0, search text DEFAULT ''::text, sortcolumn text DEFAULT 'name'::text, sortorder text DEFAULT 'asc'::text | FUNCTION |
| storage.update_updated_at_column | trigger |  | FUNCTION |
| storage.can_insert_object | void | bucketid text, name text, owner uuid, metadata jsonb | FUNCTION |
| storage.list_multipart_uploads_with_delimiter | record | bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, next_key_token text DEFAULT ''::text, next_upload_token text DEFAULT ''::text | FUNCTION |
| storage.operation | text |  | FUNCTION |
| storage.enforce_bucket_name_length | trigger |  | FUNCTION |
| storage.get_common_prefix | text | p_key text, p_prefix text, p_delimiter text | FUNCTION |
| storage.list_objects_with_delimiter | record | _bucket_id text, prefix_param text, delimiter_param text, max_keys integer DEFAULT 100, start_after text DEFAULT ''::text, next_token text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text | FUNCTION |
| storage.search_v2 | record | prefix text, bucket_name text, limits integer DEFAULT 100, levels integer DEFAULT 1, start_after text DEFAULT ''::text, sort_order text DEFAULT 'asc'::text, sort_column text DEFAULT 'name'::text, sort_column_after text DEFAULT ''::text | FUNCTION |
| storage.search_by_timestamp | record | p_prefix text, p_bucket_id text, p_limit integer, p_level integer, p_start_after text, p_sort_order text, p_sort_column text, p_sort_column_after text | FUNCTION |
| storage.protect_delete | trigger |  | FUNCTION |
| storage.allow_only_operation | bool | expected_operation text | FUNCTION |
| storage.allow_any_operation | bool | expected_operations text[] | FUNCTION |
| public.rls_auto_enable | event_trigger |  | FUNCTION |
| public.set_updated_at | trigger |  | FUNCTION |
| realtime.check_equality_op | bool | op realtime.equality_op, type_ regtype, val_1 text, val_2 text, negate boolean | FUNCTION |

## Enums

| Name | Values |
| ---- | ------- |
| auth.aal_level | aal1, aal2, aal3 |
| auth.code_challenge_method | plain, s256 |
| auth.factor_status | unverified, verified |
| auth.factor_type | phone, totp, webauthn |
| auth.oauth_authorization_status | approved, denied, expired, pending |
| auth.oauth_client_type | confidential, public |
| auth.oauth_registration_type | dynamic, manual |
| auth.oauth_response_type | code |
| auth.one_time_token_type | confirmation_token, email_change_token_current, email_change_token_new, phone_change_token, reauthentication_token, recovery_token |
| public.app_role | admin, closer, csm, leadership, setter |
| public.appointment_actor | closer, lead_link |
| public.appointment_status | cancelled_by_lead, cancelled_by_team, confirmed, no_show, rescheduled, scheduled, taken |
| public.call_disposition | closed, dq_on_call, follow_up, no_decision |
| public.call_type | follow_up, readiness, strategy |
| public.commission_basis | cash_collected |
| public.commission_eval_metric | close_rate |
| public.commission_line_type | adjustment, base, clawback, residual |
| public.commission_payout_status | approved, calculated, paid |
| public.commission_tier_name | base_10, elevated_15 |
| public.contact_identifier_type | email, phone |
| public.contract_status | completed, sent, viewed, void |
| public.deal_status | active, churned, refunded |
| public.dq_stage | closing, setting |
| public.follow_up_outcome | closed, dq, follow_up, no_show, reschedule |
| public.follow_up_sub_type | enrollment, follow_up |
| public.fulfilment_status | active, churned, completed, refunded |
| public.intake_provider | identityiq, myscoreiq |
| public.intake_status | failed, submitted, verified |
| public.lifecycle_status | customer, do_not_contact, lead, qualified |
| public.nafa_version | A, B, C, D |
| public.offer_type | booking_fee, coaching, community, core, funding, lto |
| public.opportunity_stage | active_partner, audit_complete, call_canceled_by_lead, call_canceled_by_team, call_completed, call_confirmed, closed_won, closing, contract_sent, contract_signed, deposit, dq_on_call, eligibility_call_booked, follow_up_call_booked, intake_form_needed, intake_form_submitted, interested_partner, lead_opt_in, lost, no_show, not_a_fit, strategy_call_booked, warm_list, won_pif, won_pp |
| public.optin_goal | business_credit, car, credit_cards, house, other |
| public.payment_processor | nmi, stripe |
| public.payment_type | booking_25, deposit, installment, pif |
| public.plan_type | 12pay, 13pay, 3pay, 6pay, 7pay, pif, zero_down |
| public.readiness_outcome | confirmed_ready, dq, no_contact, reschedule |
| public.receivable_status | delinquent, late, paid, scheduled, waived |
| public.refund_handling | clawback, none |
| public.rep_role | admin, closer, csm, hybrid, setter |
| public.report_status | rejected, submitted, superseded, validated |
| public.report_type | missed_call, post_call_notes, sales_call |
| public.reversal_type | chargeback, refund |
| realtime.action | DELETE, ERROR, INSERT, TRUNCATE, UPDATE |
| realtime.equality_op | eq, gt, gte, ilike, imatch, in, is, isdistinct, like, lt, lte, match, neq |
| storage.buckettype | ANALYTICS, STANDARD, VECTOR |
| sync.connection_status | connected, disconnected, error, expired |
| sync.provider | close, ghl, meta, nmi, stripe |
| sync.raw_status | failed, pending, processed |
| sync.run_status | error, partial, running, success |
| sync.run_type | backfill, reconcile, webhook, writeback |
| sync.writeback_status | failed, pending, sent, skipped |

## Relations

![er](schema.svg)

---

> Generated by [tbls](https://github.com/k1LoW/tbls)

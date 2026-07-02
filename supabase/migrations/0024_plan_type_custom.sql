-- =====================================================================
-- 0024: plan_type gains 'custom' — honest label for reconstructed or
-- closer-entered plans whose structure matches no named plan (the Sales Call
-- Report's custom cadence, and NMI-history reconstruction).
-- =====================================================================

alter type public.plan_type add value if not exists 'custom';

-- End of migration 0024.

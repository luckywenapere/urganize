-- TRM fee: allow the trm_plan billing mode (founder, 2026-10-26).
--
-- Urganize now buys TRM's own Naira plan for each team with distribution: the
-- monthly plan for a team that pays us monthly, the yearly plan once for a
-- team that pays 6 months or a year. lib/trm/partner-fee.ts records those rows
-- with billing_mode = 'trm_plan'. Only the check constraint changes; no row is
-- touched.
--
-- Backup before applying: trm_partner_ledger_backup_20261026.
-- Rollback (only if no trm_plan rows exist):
--   alter table public.trm_partner_ledger drop constraint trm_partner_ledger_billing_mode_check;
--   alter table public.trm_partner_ledger add constraint trm_partner_ledger_billing_mode_check
--     check (billing_mode in ('monthly_prorata', 'annual_upfront'));

alter table public.trm_partner_ledger drop constraint if exists trm_partner_ledger_billing_mode_check;
alter table public.trm_partner_ledger add constraint trm_partner_ledger_billing_mode_check
  check (billing_mode in ('trm_plan', 'monthly_prorata', 'annual_upfront'));

-- Drop the orphaned global_paywall settings row.
--
-- The global_paywall toggle was the pre-gating kill switch. The access gate
-- stopped consulting it when whole-app payment gating shipped (2026-05-28,
-- snapshot fallback is fail-closed), and the 2026-06-11 cleanup removed the
-- last two endpoints that touched it (POST /api/admin/paywall, the writer,
-- and GET /api/paywall-status, the reader). The row is now unreachable from
-- application code.
--
-- The app_settings table itself stays: it is the designated home for any
-- future service-role-only settings.

delete from public.app_settings where key = 'global_paywall';

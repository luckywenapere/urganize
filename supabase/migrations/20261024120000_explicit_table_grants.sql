-- Supabase stops auto-granting new public tables on 30 Oct 2026.
--
-- Until now every new table, sequence and function in `public` was granted to
-- anon, authenticated and service_role through default privileges. From 30 Oct
-- 2026 Supabase turns that off on existing projects, so a table created after
-- that date is invisible to supabase-js / PostgREST (42501 permission denied)
-- until it is granted. Existing tables keep their grants.
--
-- Urganize's migrations never granted tables explicitly; they relied on the
-- defaults. This keeps today's behaviour for every future migration by
-- setting the same default privileges explicitly for objects the `postgres`
-- role creates (the dashboard SQL editor and our hand-applied migrations).
-- Every app table has RLS on, and RLS still decides which rows each role sees.
--
-- New table migrations should still enable RLS and grant explicitly (see
-- CLAUDE.md, principle 9). Safe to run more than once.

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

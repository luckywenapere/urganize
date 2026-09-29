-- Pitch payments: the 15-minute sweep, run by Supabase (2026-09-25).
--
-- WHY SUPABASE AND NOT VERCEL. The spec checks for missed reply windows every
-- 15 minutes. The Vercel account is on the Hobby plan, which caps cron jobs at
-- once a DAY and fails the deployment outright if a schedule asks for more,
-- and both of its slots are already taken. Founder call (2026-09-25): run the
-- sweep from Supabase's pg_cron, which is free, and keep the daily Vercel cron
-- running the same sweep as a backstop in case this one is ever not set up.
--
-- WHAT IT DOES. pg_cron runs pg_net's http_get against our own route
-- (/api/cron/pitch-payments) with the same Bearer CRON_SECRET the Vercel cron
-- sends. The route does the work; nothing here touches the pitch tables.
--   * every 15 minutes, ?task=windows — expire missed windows and refund them,
--     retry refunds that failed, and send the one-day reminders.
--   * once a day,       ?task=daily   — reconcile the last 48 hours of Paystack
--     transactions and refresh the cached bank list.
--
-- ⚠️ TWO SECRETS FIRST. The URL and the secret live in Supabase Vault, never in
-- this file. Create them once in the SQL editor BEFORE applying this migration
-- (the jobs run without them, but every call fails with a 401 until they exist):
--
--   select vault.create_secret('<the CRON_SECRET value from Vercel>', 'urganize_cron_secret');
--   select vault.create_secret('https://app.urganize.app', 'urganize_app_url');
--
-- To rotate either one: select vault.update_secret(id, '<new value>') using the
-- id from vault.secrets. Nothing here needs re-running.
--
-- ⚠️ BOTH EXTENSIONS must be allowed on the project. If the create extension
-- lines are refused, switch pg_cron and pg_net on under Database > Extensions in
-- the Supabase dashboard, then run this file again. It is safe to re-run: each
-- job is unscheduled by name before it is scheduled.
--
-- Checking it works: select * from cron.job_run_details order by start_time
-- desc limit 5; shows each run, and select * from net._http_response order by
-- created desc limit 5; shows what our route answered.
--
-- Down:
--   select cron.unschedule(jobid) from cron.job
--    where jobname in ('urganize-pitch-windows', 'urganize-pitch-daily');

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.unschedule(jobid)
  from cron.job
 where jobname in ('urganize-pitch-windows', 'urganize-pitch-daily');

select cron.schedule(
  'urganize-pitch-windows',
  '*/15 * * * *',
  $job$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'urganize_app_url')
             || '/api/cron/pitch-payments?task=windows',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'urganize_cron_secret')
      ),
      timeout_milliseconds := 55000
    );
  $job$
);

-- 06:30 UTC, off the hour so it never lands on top of the two Vercel crons.
select cron.schedule(
  'urganize-pitch-daily',
  '30 6 * * *',
  $job$
    select net.http_get(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'urganize_app_url')
             || '/api/cron/pitch-payments?task=daily',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'urganize_cron_secret')
      ),
      timeout_milliseconds := 55000
    );
  $job$
);

-- Engagement drip (founder request, 2026-07-23): scheduled push
-- notifications queued per user at login — welcome (+1 min, sent inline),
-- momentum (+30 min), then come-back reminders at 1 / 7 / 14 / 30 days.
-- The long-range reminders are CANCELED and re-queued on every login, so
-- they behave as "days since last visit" and nobody is nagged a day after
-- they showed up. Delivered by /api/cron/notifications (Vercel Cron) plus
-- an opportunistic flush whenever the app is used.
--
-- Service-role access only: RLS enabled with no policies.

CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL DEFAULT '/dashboard',
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

-- The flusher's hot path: due, unsent, uncanceled.
CREATE INDEX IF NOT EXISTS scheduled_notifications_due_idx
  ON public.scheduled_notifications (send_at)
  WHERE sent_at IS NULL AND canceled_at IS NULL;

CREATE INDEX IF NOT EXISTS scheduled_notifications_user_idx
  ON public.scheduled_notifications (user_id);

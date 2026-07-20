-- URG-168: grandfather existing users past the first-time onboarding wizard.
--
-- Context: production never actually had the onboarding_* columns — the
-- onboarding API 501'd for everyone, so the wizard gate never rendered and
-- the drift went unnoticed. 20260720100000 (URG-158) then created
-- onboarding_completed with DEFAULT FALSE for every existing profile,
-- which made the app treat every veteran (including paying users) as a
-- first-timer and pop the wizard over their dashboard.
--
-- Every profile created before that migration was applied (2026-07-20
-- ~15:00 UTC) predates the wizard ever being able to track them — mark
-- them complete. Profiles created after the cutoff with
-- onboarding_completed = false are genuinely new users mid-wizard; leave
-- them alone.

update public.profiles
set onboarding_completed = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
where onboarding_completed = false
  and created_at < '2026-07-20T15:00:00Z';

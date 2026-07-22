-- URG-178: free core + paid tier feature gating. Founding Members get every
-- paid feature flag (catalog_view, chappi_assistant, file_management,
-- cross_release_insights) ON regardless of subscription state, granted
-- per-user (not per-org — subscriptions.user_id is unique, there is no
-- org-level billing concept today, see CLAUDE.md). This column is the
-- mechanism; membership is granted by the founder via direct SQL, matching
-- "schema is changed only through migrations, data is not" — there is no
-- admin UI for this yet.

alter table public.profiles add column if not exists is_founding_member boolean not null default false;

comment on column public.profiles.is_founding_member is
  'Grants all paid feature flags (see apps/web/lib/entitlements.ts) regardless of subscription status. Founder-managed, no admin UI yet.';

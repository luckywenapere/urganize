# DB Migration: Canonical Artist Name

Date: 2026-03-12

This migration adds a canonical `artist_name` field to `profiles` for Artist accounts.

## Why

- Artist users now have one profile-level artist name.
- That value is reused across onboarding and plan flows.
- It is editable only from Settings.

## SQL (idempotent)

Run this in Supabase SQL editor:

```sql
alter table public.profiles
  add column if not exists artist_name text;

comment on column public.profiles.artist_name
  is 'Canonical artist name for artist-role accounts.';
```

## Optional backfill (recommended)

If you already have artist users with no `artist_name`, this backfills from the most recent release `artist_name` per user:

```sql
with latest_release_artist as (
  select distinct on (r.user_id)
    r.user_id,
    nullif(trim(r.artist_name), '') as artist_name
  from public.releases r
  where nullif(trim(r.artist_name), '') is not null
  order by r.user_id, r.updated_at desc nulls last, r.created_at desc nulls last
)
update public.profiles p
set artist_name = lra.artist_name,
    updated_at = now()
from latest_release_artist lra
where p.id = lra.user_id
  and (p.artist_name is null or trim(p.artist_name) = '');
```

## Post-migration checks

```sql
select id, email, role, artist_name
from public.profiles
where role = 'artist'
order by updated_at desc
limit 100;
```

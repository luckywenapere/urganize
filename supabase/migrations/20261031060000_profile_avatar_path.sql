-- Your own photo on your account (2026-10-30, NEXT_PUBLIC_FEATURE_PROFILE_PHOTO).
-- See docs/notes/2026-10-30-profile-photo.md.
--
-- profiles.avatar_path holds a storage path in the private release-assets
-- bucket, always under account/<user id>/photo/. The app reads it with the
-- service role and hands out short-lived signed URLs; it is never public.
--
-- Only the service role may write it. The browser can upsert its own profiles
-- row (auth callback), so without this guard a person could point their
-- avatar at any file in the bucket and have the server sign it for their
-- team. Modelled on prevent_profile_trial_self_update (20260528, extended
-- 20260713 and 20261015), with INSERT covered too.
--
-- No storage policy change: uploads use signed upload URLs minted by the
-- service role (lib/profile-photo-server.ts), like the directory photo.
-- profiles keeps its existing RLS and grants; no new table.

alter table public.profiles
  add column if not exists avatar_path text;

create or replace function public.prevent_profile_avatar_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text := coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'role',
    ''
  );
begin
  if caller_role = 'authenticated' or caller_role = 'anon' then
    if tg_op = 'INSERT' then
      if new.avatar_path is not null then
        raise exception 'profiles: avatar_path can only be set by the service role'
          using errcode = '42501';
      end if;
    elsif new.avatar_path is distinct from old.avatar_path then
      raise exception 'profiles: avatar_path can only be modified by the service role'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_avatar_path on public.profiles;
create trigger profiles_protect_avatar_path
before insert or update on public.profiles
for each row
execute function public.prevent_profile_avatar_self_update();

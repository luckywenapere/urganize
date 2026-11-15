-- Home wallpaper (#1305, part of #1175; founder approved
-- docs/mocks/home-wallpaper). One person's pick of what sits behind Home on a
-- computer: None, Forest or Night sky. It is saved on their own profiles row,
-- so it follows them to any computer.
--
-- home_wallpaper         the pick. 'none' for everyone until they choose.
-- home_wallpaper_set_at  when they first set a picture. The wallpaper button on
--                        Home shows until this is filled, then goes for good,
--                        even if they later go back to None (the choice stays
--                        in Settings and in Customise Home).
--
-- Both are written by the person on their own row, under the existing profiles
-- update policy, the same way morning_brief is. Additive: nothing is rewritten.
--
-- Undo:
--   alter table public.profiles drop column if exists home_wallpaper_set_at;
--   alter table public.profiles drop column if exists home_wallpaper;

alter table public.profiles
  add column if not exists home_wallpaper text not null default 'none';

alter table public.profiles
  drop constraint if exists profiles_home_wallpaper_check;
alter table public.profiles
  add constraint profiles_home_wallpaper_check
  check (home_wallpaper in ('none', 'forest', 'night_sky'));

alter table public.profiles
  add column if not exists home_wallpaper_set_at timestamptz;

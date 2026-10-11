-- Promo channel directory (GitHub #833, 2026-10-11).
--
-- The places a team can push a release without a media budget: X music
-- communities and Spaces hosts, SoundCloud networks, online radio, FM radio and
-- blogs that take submissions. A manager browses them inside a rollout (the Promo
-- scene) and adds one as a dated activity.
--
-- ONE TABLE, public.promo_channels.
--   - status 'listed' is what the directory shows. 'pending' is a suggestion a
--     team member sent, waiting for an admin at /admin/promo-channels.
--     'rejected' is kept (not deleted) so the same suggestion is recognisable.
--   - kind and cost are text with CHECK constraints, not enums, like every newer
--     table here (an enum value needs a migration outside a transaction).
--   - country is ISO 3166-1 alpha-2, or null for a channel anyone anywhere can use.
--   - lead_time is what the channel itself says ("7 working days"); lead_time_days
--     is only set when that gives a number, and dates the activity.
--   - source_url records where a seeded row's facts were checked.
--   - slug makes the seed below safe to re-run.
--
-- RLS: one SELECT policy, for signed-in people, on listed rows only. NO insert,
-- update or delete policy: suggestions and reviews go through service-role
-- routes, so a pending suggestion (and who sent it) is never readable from the
-- browser.
--
-- SEED: real channels only, each checked on the web on 2026-10-11 against the
-- channel's own page (source_url). Where a channel publishes no submission
-- route, contact or lead time, the field is left empty rather than guessed.
--
-- Additive and safe to re-run.
--
-- ROLLBACK (manual):
--   drop table if exists public.promo_channels;

create table if not exists public.promo_channels (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null check (char_length(name) between 2 and 120),
  kind text not null check (kind in ('x_community', 'x_spaces', 'soundcloud', 'online_radio', 'radio', 'blog')),
  country text check (country is null or country ~ '^[A-Z]{2}$'),
  city text check (city is null or char_length(city) <= 80),
  genres text[] not null default '{}' check (cardinality(genres) <= 10),
  how_to_submit text check (how_to_submit is null or char_length(how_to_submit) <= 400),
  contact text check (contact is null or char_length(contact) <= 200),
  url text check (url is null or (char_length(url) <= 300 and url ~* '^https?://')),
  lead_time text check (lead_time is null or char_length(lead_time) <= 60),
  lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 365),
  cost text check (cost is null or cost in ('free', 'paid')),
  source_url text check (source_url is null or char_length(source_url) <= 300),
  status text not null default 'pending' check (status in ('listed', 'pending', 'rejected')),
  suggested_by uuid references auth.users(id) on delete set null,
  suggestion_note text check (suggestion_note is null or char_length(suggestion_note) <= 500),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists promo_channels_status_kind_idx on public.promo_channels (status, kind);
create index if not exists promo_channels_suggested_by_idx on public.promo_channels (suggested_by) where status = 'pending';

drop trigger if exists promo_channels_set_updated_at on public.promo_channels;
create trigger promo_channels_set_updated_at
  before update on public.promo_channels
  for each row execute function public.set_updated_at();

alter table public.promo_channels enable row level security;

drop policy if exists promo_channels_select_listed on public.promo_channels;
create policy promo_channels_select_listed on public.promo_channels
  for select to authenticated
  using (status = 'listed');

-- ---------------------------------------------------------------------------
-- Seed. status 'listed', no suggested_by.
-- ---------------------------------------------------------------------------
insert into public.promo_channels
  (slug, name, kind, country, city, genres, how_to_submit, contact, url, lead_time, lead_time_days, cost, source_url, status)
values
  -- X communities
  ('album-talks', 'Album Talks', 'x_community', 'NG', null,
   array['Afrobeats', 'Afropop', 'Hip-hop', 'R&B'],
   'Album, EP and mixtape news on X and a blog. DM on X or email for business.',
   'albumtalks@yahoo.com', 'https://x.com/AlbumTalksHQ', null, null, null,
   'https://albumtalks.com/about-us/', 'listed'),

  -- SoundCloud
  ('repost-exchange', 'Repost Exchange', 'soundcloud', null, null,
   '{}',
   'Connect your SoundCloud, repost other artists to earn credits, then spend credits on reposts of your track.',
   null, 'https://repostexchange.com/', null, null, 'free',
   'https://repostexchange.com/welcome', 'listed'),

  -- Online radio
  ('nmc-signal', 'NMC Signal', 'online_radio', 'GB', 'London',
   array['Afrobeats', 'Amapiano', 'Afropop', 'Highlife', 'Afro-drill'],
   'Afrobeats discovery radio. Submit a SoundCloud, Spotify or other streaming link on their site.',
   null, 'https://nairamusic.com/submit-music/', '7 working days', null, 'free',
   'https://nairamusic.com/submit-music/', 'listed'),

  -- Radio, Nigeria
  ('cool-fm-lagos', 'Cool FM 96.9 Lagos', 'radio', 'NG', 'Lagos',
   '{}',
   null,
   '0809 992 0254 (office)', 'https://www.coolfm.ng/lagos/', null, null, null,
   'https://www.coolfm.ng/lagos/contact/', 'listed'),
  ('cool-fm-abuja', 'Cool FM 96.9 Abuja', 'radio', 'NG', 'Abuja',
   '{}',
   null,
   '0809 992 0254 (office)', 'https://www.coolfm.ng/abuja/', null, null, null,
   'https://www.coolfm.ng/abuja/say-hello-abuja/', 'listed'),
  ('soundcity-lagos', 'Soundcity Radio 98.5 Lagos', 'radio', 'NG', 'Lagos',
   '{}',
   'Email the audio file and your EPK for airplay. A play in Lagos does not carry to other Soundcity stations.',
   'ima@soundcity.tv', 'https://soundcity.tv/music-submission', null, null, null,
   'https://soundcity.tv/listenradio/', 'listed'),
  ('soundcity-abuja', 'Soundcity Radio 96.3 Abuja', 'radio', 'NG', 'Abuja',
   '{}',
   'Email the audio file and your EPK for airplay.',
   'ima@soundcity.tv', 'https://soundcity.tv/music-submission', null, null, null,
   'https://soundcity.tv/listenradio/', 'listed'),
  ('the-beat-lagos', 'The Beat 99.9 FM Lagos', 'radio', 'NG', 'Lagos',
   '{}',
   null,
   'info@thebeat99.com', 'https://thebeat99.com/contact', null, null, null,
   'https://thebeat99.com/contact', 'listed'),

  -- Radio, UK
  ('bbc-1xtra', 'BBC Radio 1Xtra', 'radio', 'GB', null,
   array['Afrobeats', 'Hip-hop', 'R&B', 'Dancehall'],
   'Email download links and a short note on you and the release. No feedback is given.',
   '1XtraMusicTeam@bbc.co.uk', 'https://www.bbc.co.uk/programmes/articles/YpG5RCQYx95ZhMYT4HdzmV/about-radio-1xtra', null, null, 'free',
   'https://www.bbc.co.uk/programmes/articles/YpG5RCQYx95ZhMYT4HdzmV/about-radio-1xtra', 'listed'),
  ('bbc-music-introducing', 'BBC Music Introducing', 'radio', 'GB', null,
   '{}',
   'UK-based artists only (needs a UK postcode). Upload tracks; your local show can pass them to 1Xtra and Radio 1.',
   null, 'https://www.bbc.co.uk/introducing', 'Up to 6 months', null, 'free',
   'https://www.bbc.co.uk/articles/cn7dl153zdmo', 'listed'),
  ('colourful-radio', 'Colourful Radio', 'radio', 'GB', 'London',
   array['Afrobeats', 'Soul', 'R&B'],
   'Email to start the process.',
   'music@colourful.com', 'https://www.colourful.com/', null, null, null,
   'https://www.colourful.com/', 'listed'),

  -- Blogs and media
  ('notjustok', 'Notjustok', 'blog', 'NG', null,
   array['Afrobeats', 'Afropop'],
   'Send music to the music address only.',
   'music@notjustok.com', 'https://notjustok.com/contact-us/', null, null, null,
   'https://notjustok.com/contact-us/', 'listed'),
  ('naijaloaded', 'Naijaloaded', 'blog', 'NG', null,
   '{}',
   'Pick a promotion package; features on the homepage, playlists and socials.',
   null, 'https://naijaloaded.ng/promote', null, null, 'paid',
   'https://naijaloaded.ng/promote', 'listed'),
  ('the-native', 'The NATIVE', 'blog', 'NG', null,
   array['Afrobeats', 'Afropop', 'Alté', 'Hip-hop'],
   'No submission form. Pitch the general address or their Instagram and X.',
   'contact@thenativemag.com', 'https://thenativemag.com/', null, null, null,
   'https://thenativemag.com/about/', 'listed'),
  ('okayafrica', 'OkayAfrica', 'blog', null, null,
   '{}',
   'Submissions go through Groover, which charges per submission and guarantees a listen.',
   null, 'https://groover.co/en/influencer/profile/0.okayafrica', null, null, 'paid',
   'https://www.okayafrica.com/submit-your-music-to-okayafrica-through-groover/171837', 'listed')
on conflict (slug) do nothing;

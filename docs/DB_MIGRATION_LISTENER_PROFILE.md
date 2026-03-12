# Listener Profile Table Setup

Run this SQL in your Supabase SQL editor to enable the Ideal Listener Profile feature.

```sql
create table if not exists public.listener_profile_inputs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  workspace_id uuid null references public.releases(id) on delete set null,
  artist_id uuid null references public.profiles(id) on delete set null,
  artist_name text null,
  primary_genre text null,
  subgenre_influences text null,
  music_mood text null,
  lyric_themes text null,
  music_languages text null,
  similar_artists text null,
  artist_aesthetic text null,
  fashion_influence text null,
  brand_message text null,
  artist_personality text null,
  artist_values text null,
  listener_age_range text null,
  listener_gender_tendency text null,
  listener_countries text null,
  listener_cities_regions text null,
  listener_languages text null,
  listener_lifestyle text null,
  listener_interests text null,
  listener_communities text null,
  listener_platforms text null,
  listener_activity_time text null,
  music_discovery text null,
  listener_emotions text null,
  listener_problems text null,
  listener_aspirations text null,
  listener_share_triggers text null,
  listener_loyalty_triggers text null,
  campaign_visual_triggers text null,
  campaign_message_style text null,
  campaign_content_hooks text null,
  generated_persona jsonb null,
  generated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listener_profile_inputs_user_id_idx
  on public.listener_profile_inputs(user_id);

alter table public.listener_profile_inputs enable row level security;
```

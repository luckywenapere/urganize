/**
 * Album release template — v0.1.
 *
 * DRAFT, pending design-partner review. Single v0.3 was signed off by two
 * design partners; this has not had that pass, which is why it ships behind
 * NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES.
 *
 * Hand-crafted 21-week rollout: 17 weeks pre-release plus 4 weeks of
 * post-release follow-up. It extends the EP shape with TWO staggered singles
 * instead of one, and a longer tail. That is the whole difference, and it
 * drives every offset here:
 *
 * - Single 1 drops at -84 (12 weeks out). It opens the campaign and builds
 *   editorial relationships from nothing.
 * - Single 2 drops at -42 (6 weeks out) alongside the album announcement and
 *   tracklist reveal. It converts the audience single 1 found into pre-saves
 *   for the full project.
 * - The album lands at 0, pitched to editorial at -35 on the combined evidence
 *   of both singles.
 * - The tail runs four weeks (+1, +8, +15, +22, +29) rather than the EP's
 *   three: an album has more tracks to give their own moment, and long-tail
 *   accumulation is where album streams actually come from.
 *
 * The 17-week runway is not padding. Two full single rollouts have to complete
 * inside it before the album's own 5-week editorial window even opens, which
 * is also why the earliest offset (-119) sits just inside the planner's
 * MIN_TASK_OFFSET of -120. Do not push it earlier without raising that bound.
 *
 * Multi-track logic follows the EP template: metadata, split sheets and the
 * content shoot are SINGLE tasks covering every track, not one row per track.
 * The tracklist is unknown at authoring time and the AI tailoring layer has no
 * operation for adding tasks.
 *
 * Source of truth: ./album-v0.1.md.
 *
 * @see CLAUDE.md "Hand-crafted release templates" section
 */

import type { Template } from './types';

export const ALBUM_RELEASE_TEMPLATE: Template = {
  id: 'album_v0.1',
  release_type: 'album',
  name: 'Album Release: 21 Week Rollout',
  description:
    '17 weeks of pre-release work plus 4 weeks of post-release follow-up, built around two staggered singles at 12 and 6 weeks out. Designed for independent managers running a full album campaign.',
  default_duration_days: 148,
  version: '0.1.0',
  tasks: [
    // -----------------------------------------------------------------------
    // Week 17 — Album Strategy & Narrative (Days 1-7) [offset -119]
    // -----------------------------------------------------------------------
    {
      id: 'w17_lock_tracklist',
      title: 'Lock the tracklist and running order',
      description:
        'Decide which tracks make the album and in what order. On an album the running order is part of the work itself, and every downstream task depends on it: metadata, artwork, and which tracks carry the campaign.',
      role: 'artist',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'asset_production'],
    },
    {
      id: 'w17_lock_all_masters',
      title: 'Lock all masters for every track',
      description:
        'Confirm the final mix and mastered version of every track on the album is delivered and signed off. These are the files that go to the distributor. No further edits after this point — on any track.',
      role: 'artist',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w17_define_narrative',
      title: 'Define the album narrative',
      description:
        'Write down what the record is about and how it gets sold: the throughline, the reference points, and the one sentence a journalist would use. An album is pitched as an idea, not as a set of songs, and every asset from here follows this.',
      role: 'manager',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'marketing'],
    },
    {
      id: 'w17_select_singles',
      title: 'Select the singles and their order',
      description:
        'Pick single 1 (12 weeks out), single 2 (6 weeks out), and optionally a third for after release. Single 1 opens the campaign cold, so it needs the widest reach; single 2 converts that audience into pre-saves, so it should be the most immediate.',
      role: 'manager',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      depends_on: ['w17_lock_tracklist'],
      optional: false,
      tags: ['planning', 'marketing'],
    },
    {
      id: 'w17_confirm_release_date',
      title: 'Confirm the album release date and lock it',
      description:
        'Lock the public album release date with the artist and team. Both single drops and every task in this plan are anchored to it.',
      role: 'manager',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w17_map_campaign_timeline',
      title: 'Map the full campaign timeline backwards from release day',
      description:
        'Lay out both single rollouts and the album rollout on one calendar and check they do not collide. The common failure is single 2 landing so close to the album that the two compete for the same attention.',
      role: 'manager',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      depends_on: ['w17_select_singles', 'w17_confirm_release_date'],
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w17_choose_distributor',
      title: 'Choose distributor and confirm it handles a staggered campaign',
      description:
        'Verify the account is active and billing is current, and confirm how it handles singles that later appear on an album. Getting this wrong means duplicate tracks or a broken album page at launch.',
      role: 'manager',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      optional: false,
      tags: ['distribution', 'planning'],
    },
    {
      id: 'w17_set_budget',
      title: 'Set the rollout budget across both singles and the album',
      description:
        'Split the budget three ways and hold the album share back. Two singles will consume everything you let them, and the album itself is the release that needs support most.',
      role: 'manager',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w17_brief_marketing_lead',
      title: 'Brief the marketing lead on the album',
      description:
        'Walk the marketing lead through the record: narrative, themes, target audience, the single order, and the campaign shape. Owner: manager with artist input.',
      role: 'manager',
      type: 'task',
      offset_days: -119,
      duration_days: 1,
      depends_on: ['w17_define_narrative'],
      optional: false,
      tags: ['planning', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 16 — Paperwork & Rights (Days 8-14) [offset -112]
    // -----------------------------------------------------------------------
    {
      id: 'w16_write_album_metadata',
      title: 'Write metadata for every track',
      description:
        'Title, ISRC if pre-assigned, songwriter splits, producer credits, and language — for every track on the album. This is the largest paperwork job in the campaign; start it 16 weeks out precisely because it always takes longer than expected.',
      role: 'manager',
      type: 'task',
      offset_days: -112,
      duration_days: 1,
      depends_on: ['w17_lock_tracklist'],
      optional: false,
      tags: ['planning', 'distribution'],
    },
    {
      id: 'w16_draft_split_sheets',
      title: 'Draft split sheets for every track and circulate',
      description:
        'One split sheet per track, circulated to every contributor on that track. On an album this is a dozen or more documents; chasing them is the job, and it starts now.',
      role: 'manager',
      type: 'task',
      offset_days: -112,
      duration_days: 1,
      depends_on: ['w17_lock_tracklist'],
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w16_confirm_clearances',
      title: 'Confirm sample clearances and features are documented',
      description:
        'Check every sample is cleared and every featured artist has an agreement in writing. An uncleared sample is the one problem that can pull a finished album off every DSP after release.',
      role: 'manager',
      type: 'task',
      offset_days: -112,
      duration_days: 1,
      depends_on: ['w17_lock_tracklist'],
      optional: false,
      tags: ['planning', 'distribution'],
    },
    {
      id: 'w16_brief_designer_album_art',
      title: 'Brief the designer on album cover art',
      description:
        'Brief the album cover: concept, references, dimensions, and how the single covers should relate to it. Album art carries the narrative and every later channel pulls from it, so it starts before either single is designed.',
      role: 'manager',
      type: 'task',
      offset_days: -112,
      duration_days: 1,
      depends_on: ['w17_define_narrative'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w16_plan_content_shoot',
      title: 'Plan the album content shoot',
      description:
        'Plan one shoot that covers the whole record and both singles: BTS, performance, promo stills, and per-track material. Shooting once for a 21-week campaign is the single biggest cost saving available here.',
      role: 'manager',
      type: 'task',
      offset_days: -112,
      duration_days: 1,
      optional: false,
      tags: ['asset_production', 'planning'],
    },
    {
      id: 'w16_physical_formats',
      title: 'Physical formats production',
      description:
        'If vinyl, CD, or cassette is part of this album, begin manufacturing now — production runs 8 to 12 weeks and vinyl in particular can run longer. It is the one deadline that cannot be compressed later.',
      role: 'manager',
      type: 'task',
      offset_days: -112,
      duration_days: 1,
      optional: true,
      tags: ['asset_production'],
    },

    // -----------------------------------------------------------------------
    // Week 15 — Single 1 Delivery (Days 15-21) [offset -105]
    // -----------------------------------------------------------------------
    {
      id: 'w15_upload_single_1',
      title: 'Upload single 1 to the distributor',
      description:
        'Deliver single 1 as its own release, three weeks before its drop at -84. Treat it as a real single: it is the campaign opener and it has to stand on its own.',
      role: 'manager',
      type: 'task',
      offset_days: -105,
      duration_days: 1,
      depends_on: ['w17_lock_all_masters', 'w17_select_singles', 'w16_write_album_metadata'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w15_brief_single_1_art',
      title: 'Brief the designer on single 1 artwork',
      description:
        'Brief the single 1 cover so it reads as the first chapter of the album world rather than an unrelated release.',
      role: 'manager',
      type: 'task',
      offset_days: -105,
      duration_days: 1,
      depends_on: ['w16_brief_designer_album_art'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w15_identify_single_1_playlists',
      title: 'Identify priority playlists and curators for single 1',
      description:
        'Pick 3 to 5 priority curators. These are the first relationships of the campaign, and both single 2 and the album pitch will come back to them.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -105,
      duration_days: 1,
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w15_split_signatures',
      title: 'Finalize split sheet signatures for every track',
      description:
        'Chase every contributor on every track until each sheet is signed. On an album this is weeks of chasing, which is why it started at -112.',
      role: 'manager',
      type: 'task',
      offset_days: -105,
      duration_days: 1,
      depends_on: ['w16_draft_split_sheets'],
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w15_content_shoot',
      title: 'Album content shoot executed',
      description:
        'Shoot the whole campaign in one go: album material, single 1 material, single 2 material, and per-track ideas. Everything for the next 17 weeks should come out of this day.',
      role: 'artist',
      type: 'task',
      offset_days: -105,
      duration_days: 1,
      depends_on: ['w16_plan_content_shoot'],
      optional: false,
      tags: ['asset_production'],
    },

    // -----------------------------------------------------------------------
    // Week 14 — Single 1 Editorial Push (Days 22-28) [offset -98]
    // -----------------------------------------------------------------------
    {
      id: 'w14_confirm_single_1_accepted',
      title: 'Confirm the distributor accepted single 1',
      description:
        'Check the submission went through with no metadata errors. If it was rejected, resubmit immediately — the whole 17-week calendar is stacked behind this drop date.',
      role: 'manager',
      type: 'task',
      offset_days: -98,
      duration_days: 1,
      depends_on: ['w15_upload_single_1'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w14_single_1_art_approved',
      title: 'Single 1 artwork final approved',
      description:
        'Sign off the final single 1 cover. It goes to the distributor, every DSP, and every promo asset for the campaign opener.',
      role: 'artist',
      type: 'task',
      offset_days: -98,
      duration_days: 1,
      depends_on: ['w15_brief_single_1_art'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w14_single_1_editorial_pitch',
      title: 'Submit the single 1 editorial pitch',
      description:
        'Pitch through Spotify for Artists with the private link and final assets. Say plainly that an album follows and name the date: editorial weighs a campaign higher than a one-off, and this is the first time they hear the story.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -98,
      duration_days: 1,
      depends_on: ['w14_confirm_single_1_accepted'],
      optional: false,
      tags: ['editorial', 'marketing'],
    },
    {
      id: 'w14_single_1_curator_outreach',
      title: 'Begin curator outreach for single 1',
      description:
        'Work the priority list with a private link. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -98,
      duration_days: 7,
      depends_on: ['w15_identify_single_1_playlists'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w14_trim_footage',
      title: 'Begin trimming shoot footage into promo edits',
      description:
        'Cut the shoot into edits tagged by track and by which drop they belong to. Rolling work across the week. This library has to carry three separate rollouts, so organising it now is what makes the rest cheap.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -98,
      duration_days: 7,
      depends_on: ['w15_content_shoot'],
      optional: false,
      tags: ['asset_production', 'marketing'],
    },
    {
      id: 'w14_album_art_draft',
      title: 'Album cover art first draft delivered',
      description:
        'First pass at the album cover, for review against the single 1 art already approved.',
      role: 'designer',
      type: 'task',
      offset_days: -98,
      duration_days: 1,
      depends_on: ['w16_brief_designer_album_art'],
      optional: false,
      tags: ['asset_production'],
    },

    // -----------------------------------------------------------------------
    // Week 13 — Single 1 Ramp (Days 29-35) [offset -91]
    // -----------------------------------------------------------------------
    {
      id: 'w13_single_1_presave_setup',
      title: 'Set up the single 1 pre-save link',
      description:
        'Build the pre-save now the distributor has accepted. Every name captured here is someone you will ask for an album pre-save in ten weeks.',
      role: 'manager',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      depends_on: ['w14_confirm_single_1_accepted'],
      optional: false,
      tags: ['marketing', 'distribution'],
    },
    {
      id: 'w13_announce_single_1',
      title: 'Announce single 1 release date on socials',
      description:
        'Announce single 1 and say an album follows. This is the first public moment of the campaign.',
      role: 'artist',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w13_single_1_teasers',
      title: 'Single 1 teaser content begins',
      description:
        'Start the teaser cadence for single 1: one piece every 2 to 3 days. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -91,
      duration_days: 7,
      depends_on: ['w14_trim_footage'],
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w13_single_1_curator_followup',
      title: 'Follow up on single 1 curator outreach',
      description:
        'Chase the curators who have not replied. A follow-up converts far more often than the first send.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      depends_on: ['w14_single_1_curator_outreach'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w13_analytics_access',
      title: 'Set up Spotify and Apple Music for Artists access',
      description:
        'Get analytics access in place before the first drop. Single 1 is the campaign baseline, and you cannot recover its first-week data later.',
      role: 'manager',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      optional: false,
      tags: ['analytics', 'planning'],
    },
    {
      id: 'w13_album_art_approved',
      title: 'Album cover art final approved',
      description:
        'Sign off the final album cover. The album distributor upload at -49 is blocked until this exists.',
      role: 'artist',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      depends_on: ['w14_album_art_draft'],
      optional: false,
      tags: ['asset_production'],
    },

    // -----------------------------------------------------------------------
    // Week 12 — SINGLE 1 DROP (Days 36-42) [offset -84]
    // -----------------------------------------------------------------------
    {
      id: 'w12_single_1_drop',
      title: 'Single 1 drops: post across all platforms',
      description:
        'The campaign opener is out. Post everywhere, and make sure every post names the album and its date.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: -84,
      duration_days: 1,
      depends_on: ['w14_confirm_single_1_accepted'],
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },
    {
      id: 'w12_monitor_single_1_golive',
      title: 'Monitor the distributor for single 1 go-live',
      description:
        'Check single 1 is live across every DSP with the right artwork, credits, and artist profile.',
      role: 'manager',
      type: 'event_milestone',
      offset_days: -84,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'distribution', 'event'],
    },
    {
      id: 'w12_single_1_first_numbers',
      title: "Compile single 1's first-48-hours numbers",
      description:
        'Streams, saves, playlist adds, and top markets in the first 48 hours. This is the evidence the single 2 pitch is built on, and half the evidence the album pitch needs.',
      role: 'manager',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      depends_on: ['w13_analytics_access'],
      optional: false,
      tags: ['analytics'],
    },
    {
      id: 'w12_single_1_thankyou',
      title: 'Thank-you content and early stats to the team',
      description:
        'Thank the people who showed up and share the first numbers with the team.',
      role: 'artist',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w12_single_1_fan_engagement',
      title: 'Engage with fan posts and tags from the single 1 drop',
      description:
        'Repost, comment, and share what fans made. Rolling work across the week.',
      role: 'artist',
      type: 'task',
      offset_days: -84,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 11 — Single 1 Momentum (Days 43-49) [offset -77]
    // -----------------------------------------------------------------------
    {
      id: 'w11_review_single_1_performance',
      title: 'Review single 1 performance',
      description:
        'Look honestly at markets, content, and playlists. What single 1 proved is the best information you will have when choosing how to spend on single 2 and the album.',
      role: 'manager',
      type: 'task',
      offset_days: -77,
      duration_days: 1,
      depends_on: ['w12_single_1_first_numbers'],
      optional: false,
      tags: ['analytics', 'planning'],
    },
    {
      id: 'w11_confirm_single_1_placements',
      title: 'Confirm single 1 playlist placements',
      description:
        'Confirm the placements that came back positive and note which curators to return to for single 2 and the album.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -77,
      duration_days: 1,
      depends_on: ['w13_single_1_curator_followup'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w11_single_1_followup_content',
      title: 'Post follow-up content for single 1',
      description:
        'Keep single 1 alive while single 2 is prepared. Rolling work across the week. A campaign opener that goes quiet takes the album story with it.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -77,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w11_brief_pr',
      title: 'Brief PR contacts on the album campaign',
      description:
        'Brief press on the album with single 1 already out and performing. An album is the story worth covering; the singles are the hooks to open on.',
      role: 'manager',
      type: 'task',
      offset_days: -77,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 10 — Single 2 Delivery (Days 50-56) [offset -70]
    // -----------------------------------------------------------------------
    {
      id: 'w10_upload_single_2',
      title: 'Upload single 2 to the distributor',
      description:
        'Deliver single 2 as its own release, four weeks before its drop at -42. It lands alongside the album announcement, so its date has no slack in it.',
      role: 'manager',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      depends_on: ['w17_lock_all_masters', 'w17_select_singles', 'w16_write_album_metadata'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w10_brief_single_2_art',
      title: 'Brief the designer on single 2 artwork',
      description:
        'Brief the single 2 cover as the second chapter: recognisably the same world as single 1 and the album.',
      role: 'manager',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      depends_on: ['w16_brief_designer_album_art'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w10_identify_single_2_playlists',
      title: 'Identify priority playlists and curators for single 2',
      description:
        'Build the single 2 list, starting with everyone who supported single 1.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      depends_on: ['w11_confirm_single_1_placements'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w10_adjust_album_plan',
      title: 'Adjust the album plan based on what single 1 proved',
      description:
        'Move budget, content, and targeting toward what single 1 actually rewarded rather than what was planned 10 weeks ago. This mid-campaign correction is the advantage a staggered album rollout has over a single drop.',
      role: 'manager',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      depends_on: ['w11_review_single_1_performance'],
      optional: true,
      tags: ['planning', 'analytics'],
    },

    // -----------------------------------------------------------------------
    // Week 9 — Single 2 Editorial Push (Days 57-63) [offset -63]
    // -----------------------------------------------------------------------
    {
      id: 'w9_confirm_single_2_accepted',
      title: 'Confirm the distributor accepted single 2',
      description:
        'Check the submission went through with no metadata errors. If it was rejected, resubmit immediately — the album announcement is scheduled against this drop.',
      role: 'manager',
      type: 'task',
      offset_days: -63,
      duration_days: 1,
      depends_on: ['w10_upload_single_2'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w9_single_2_art_approved',
      title: 'Single 2 artwork final approved',
      description:
        'Sign off the final single 2 cover.',
      role: 'artist',
      type: 'task',
      offset_days: -63,
      duration_days: 1,
      depends_on: ['w10_brief_single_2_art'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w9_single_2_editorial_pitch',
      title: "Submit the single 2 editorial pitch with single 1's numbers",
      description:
        "Pitch single 2 with single 1's real performance attached. This is a materially stronger pitch than single 1's was, and it is the rehearsal for the album pitch four weeks later.",
      role: 'marketing_lead',
      type: 'task',
      offset_days: -63,
      duration_days: 1,
      depends_on: ['w9_confirm_single_2_accepted', 'w12_single_1_first_numbers'],
      optional: false,
      tags: ['editorial', 'marketing'],
    },
    {
      id: 'w9_single_2_curator_outreach',
      title: 'Begin curator outreach for single 2',
      description:
        'Work the single 2 list with a private link. Rolling work across the week. Return to single 1 supporters first.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -63,
      duration_days: 7,
      depends_on: ['w10_identify_single_2_playlists'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },

    // -----------------------------------------------------------------------
    // Week 8 — Single 2 Ramp (Days 64-70) [offset -56]
    // -----------------------------------------------------------------------
    {
      id: 'w8_single_2_presave_setup',
      title: 'Set up the single 2 pre-save link',
      description:
        'Build the single 2 pre-save and point the single 1 audience at it.',
      role: 'manager',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      depends_on: ['w9_confirm_single_2_accepted'],
      optional: false,
      tags: ['marketing', 'distribution'],
    },
    {
      id: 'w8_announce_single_2',
      title: 'Announce single 2 release date on socials',
      description:
        'Announce single 2 and trail the album announcement that lands with it.',
      role: 'artist',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w8_single_2_teasers',
      title: 'Single 2 teaser content begins',
      description:
        'Start the teaser cadence for single 2. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -56,
      duration_days: 7,
      depends_on: ['w14_trim_footage'],
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w8_single_2_curator_followup',
      title: 'Follow up on single 2 curator outreach',
      description:
        'Chase the curators who have not replied on single 2.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      depends_on: ['w9_single_2_curator_outreach'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w8_prepare_album_announcement',
      title: 'Prepare the album announcement assets',
      description:
        'Build the announcement package now: tracklist graphic, cover reveal, pre-save link copy, and press note. It ships in two weeks alongside single 2 and should not be assembled that morning.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      depends_on: ['w13_album_art_approved'],
      optional: false,
      tags: ['marketing', 'asset_production'],
    },

    // -----------------------------------------------------------------------
    // Week 7 — Album Delivery (Days 71-77) [offset -49]
    // -----------------------------------------------------------------------
    {
      id: 'w7_upload_album_to_distributor',
      title: 'Upload the album to the distributor',
      description:
        'Deliver every track and its metadata. This is the central pre-release gate: every DSP delivery downstream waits on it, and metadata errors only surface after submission. An album has the most fields to get wrong of any release type, so leave real time for a resubmission.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      depends_on: ['w17_lock_all_masters', 'w16_write_album_metadata', 'w13_album_art_approved'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w7_upload_album_art',
      title: 'Upload album cover art to the distributor',
      description:
        'Deliver the approved album cover at the required dimensions.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      depends_on: ['w13_album_art_approved'],
      optional: false,
      tags: ['distribution', 'asset_production'],
    },
    {
      id: 'w7_confirm_album_date_locked',
      title: 'Confirm the album release date is locked at the distributor',
      description:
        'Verify the date at the distributor matches the date you are promoting, and that the two already-released singles are set to appear on the album correctly.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      depends_on: ['w7_upload_album_to_distributor'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w7_schedule_single_2_posts',
      title: 'Schedule single 2 release-day posts',
      description:
        'Queue the single 2 drop-day posts, including the album announcement that goes out with them.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      depends_on: ['w8_prepare_album_announcement'],
      optional: false,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 6 — SINGLE 2 DROP & ALBUM ANNOUNCE (Days 78-84) [offset -42]
    // -----------------------------------------------------------------------
    {
      id: 'w6_single_2_drop',
      title: 'Single 2 drops: post across all platforms',
      description:
        'Single 2 is out. Post everywhere, and lead straight into the album announcement — the two land together on purpose.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: -42,
      duration_days: 1,
      depends_on: ['w9_confirm_single_2_accepted'],
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },
    {
      id: 'w6_monitor_single_2_golive',
      title: 'Monitor the distributor for single 2 go-live',
      description:
        'Check single 2 is live across every DSP with the right artwork and credits.',
      role: 'manager',
      type: 'event_milestone',
      offset_days: -42,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'distribution', 'event'],
    },
    {
      id: 'w6_announce_album',
      title: 'Announce the album with the tracklist reveal',
      description:
        'Announce the album, the date, the cover, and the tracklist, with the pre-save live. Two singles are already out and working, so this lands on an audience that has a reason to care.',
      role: 'artist',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      depends_on: ['w8_prepare_album_announcement'],
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w6_single_2_first_numbers',
      title: "Compile single 2's first-48-hours numbers",
      description:
        'Streams, saves, playlist adds, and top markets. Together with single 1, this is the full evidence base for the album editorial pitch next week.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      depends_on: ['w13_analytics_access'],
      optional: false,
      tags: ['analytics'],
    },
    {
      id: 'w6_single_2_fan_engagement',
      title: 'Engage with fan posts and tags from the single 2 drop',
      description:
        'Repost, comment, and share what fans made. Rolling work across the week.',
      role: 'artist',
      type: 'task',
      offset_days: -42,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 5 — Album Editorial & Pre-save (Days 85-91) [offset -35]
    // -----------------------------------------------------------------------
    {
      id: 'w5_confirm_album_accepted',
      title: 'Confirm the distributor accepted the album',
      description:
        'Check every track went through with no metadata errors and the running order is right. On an album a single rejected or misordered track holds the whole release.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w7_upload_album_to_distributor'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w5_album_editorial_pitch',
      title: "Pitch the album to editorial with both singles' traction as evidence",
      description:
        'Pitch the album with real numbers from two released singles: streams, saves, playlist adds, markets, and growth between the two. Five weeks out keeps you inside the editorial window. This combined evidence is the entire reason the campaign was staggered.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w12_single_1_first_numbers', 'w6_single_2_first_numbers'],
      optional: false,
      tags: ['editorial', 'marketing'],
    },
    {
      id: 'w5_album_presave_setup',
      title: 'Set up the album pre-save link',
      description:
        'Build the album pre-save and point both singles\' audiences at it.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w5_confirm_album_accepted'],
      optional: false,
      tags: ['marketing', 'distribution'],
    },
    {
      id: 'w5_album_presave_live',
      title: 'Album pre-save campaign goes live',
      description:
        'Push the album pre-save publicly, leading with the two singles already out.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w5_album_presave_setup'],
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w5_identify_album_playlists',
      title: 'Identify priority playlists and curators for the album',
      description:
        'Build the album list from every curator who supported either single, plus album-oriented and long-form playlists the singles were too short for.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w5_plan_focus_tracks',
      title: 'Plan the post-release focus tracks',
      description:
        'Decide now which tracks get pushed after release day and in what order. An album goes quiet two weeks after launch unless this was planned before release week arrived.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w17_lock_tracklist'],
      optional: false,
      tags: ['planning', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 4 — Album Curator & Press Push (Days 92-98) [offset -28]
    // -----------------------------------------------------------------------
    {
      id: 'w4_album_curator_outreach',
      title: 'Begin album curator outreach with a private link',
      description:
        'Work the album list with a private link. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -28,
      duration_days: 7,
      depends_on: ['w5_identify_album_playlists'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w4_send_press_release',
      title: 'Send the album press release to contacts',
      description:
        'Send the release with both singles\' numbers as the reason to pay attention.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w4_pitch_long_form_press',
      title: 'Pitch long-form press: interviews, features, album reviews',
      description:
        'Albums get coverage singles cannot: reviews, interviews, and features. Four weeks out is the window for publications that plan ahead, and the narrative locked at -119 is what you pitch.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      depends_on: ['w17_define_narrative'],
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w4_confirm_events',
      title: 'Confirm any release-day events',
      description:
        'Lock whatever is happening on the day: playback event, listening session, IG live, in-store, or nothing at all.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      optional: false,
      tags: ['event', 'planning'],
    },

    // -----------------------------------------------------------------------
    // Week 3 — Marketing Ramp (Days 99-105) [offset -21]
    // -----------------------------------------------------------------------
    {
      id: 'w3_album_teaser_rollout',
      title: 'Album teaser content rollout begins',
      description:
        'Start the album teaser cadence: one piece every 2 to 3 days. Rolling work across the week. This is what carries the audience from the announcement to release day.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w3_track_by_track',
      title: 'Track-by-track teaser plan executed',
      description:
        'Give unreleased tracks their own moments using the per-track edits from the shoot. Rolling work across the week. On an album this is most of the run-up content.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 7,
      depends_on: ['w14_trim_footage'],
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w3_album_curator_followup',
      title: 'Follow up on album curator outreach',
      description:
        'Chase the curators who have not replied on the album.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      depends_on: ['w4_album_curator_outreach'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w3_schedule_release_posts',
      title: 'Schedule album release-day social posts',
      description:
        'Queue the release-day posts across every platform.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w3_tease_third_single',
      title: 'Tease the third single or focus track',
      description:
        'If a third single was selected at -119, start seeding it now so it has somewhere to land after release day.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      depends_on: ['w17_select_singles'],
      optional: true,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 2 — Final Prep (Days 106-112) [offset -14]
    // -----------------------------------------------------------------------
    {
      id: 'w2_listening_party',
      title: 'Listening party or album playback event planned',
      description:
        'If you are doing one, plan it now: date, venue or platform, guest list, and the running order for the playback. A full album playback is an event a single cannot support.',
      role: 'manager',
      type: 'event_milestone',
      offset_days: -14,
      duration_days: 1,
      optional: true,
      tags: ['event', 'marketing'],
    },
    {
      id: 'w2_increase_teasers',
      title: 'Increase teaser content frequency',
      description:
        'Tighten the cadence into release week. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -14,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w2_prepare_release_day_content',
      title: 'Prepare release-day stories and posts',
      description:
        'Build and queue the full release-day sequence in the scheduler.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -14,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w2_confirm_album_placements',
      title: 'Confirm album playlist placements',
      description:
        'Confirm which album placements came back positive so release-day messaging can point at them.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -14,
      duration_days: 1,
      depends_on: ['w3_album_curator_followup'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w2_brief_release_day_roles',
      title: 'Brief the team on release-day roles',
      description:
        'Say who watches the DSPs, who posts, who answers press, and who talks to the artist. An album release day has more moving parts than one person can hold.',
      role: 'manager',
      type: 'task',
      offset_days: -14,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },

    // -----------------------------------------------------------------------
    // Week 1 — Release Week (Days 113-119) [offset -7 / -3 / -1]
    // -----------------------------------------------------------------------
    {
      id: 'w1_countdown',
      title: '7 days out: countdown content begins',
      description:
        'Run the countdown into release day. Rolling work across the week.',
      role: 'artist',
      type: 'task',
      offset_days: -7,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w1_final_push_ads',
      title: '3 days out: final push, ads start',
      description:
        'If the budget allows, run paid support into release day. This is the album share you held back at -119.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -3,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w1_presave_reminder',
      title: '1 day out: pre-save reminder to fans',
      description:
        'Last call on the album pre-save to the mailing list and socials.',
      role: 'manager',
      type: 'task',
      offset_days: -1,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Release Day [offset 0]
    // -----------------------------------------------------------------------
    {
      id: 'release_day_announcement',
      title: 'Release day: post the album drop announcement across all platforms',
      description:
        'The album is out. Post everywhere, and point people at the full record rather than only the two singles they already know.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: 0,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },
    {
      id: 'release_day_monitor_distributor',
      title: 'Release day: monitor the distributor for go-live across all DSPs',
      description:
        'Check every track is live on every DSP, in the right running order, with the right credits and artwork, and that both released singles resolved onto the album page correctly.',
      role: 'manager',
      type: 'event_milestone',
      offset_days: 0,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'distribution', 'event'],
    },
    {
      id: 'release_day_thankyou_content',
      title: 'Release day: thank-you content, share early stats with the team',
      description:
        'Thank the people who showed up and share the first numbers with the team.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: 0,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },

    // -----------------------------------------------------------------------
    // Week 0 — Release Week Wrap-Up [offset +1]
    // -----------------------------------------------------------------------
    {
      id: 'w0_compile_first_week_stats',
      title: 'Compile first-week stats',
      description:
        'Streams, saves, playlist adds, and top markets — for the album as a whole and broken down per track. The per-track split is what decides the focus-track order for the next month.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      depends_on: ['w13_analytics_access'],
      optional: false,
      tags: ['analytics', 'followup'],
    },
    {
      id: 'w0_identify_standout_tracks',
      title: 'Identify the standout tracks by streams and saves',
      description:
        'Find the tracks the audience actually chose. On an album these are frequently neither single, and they are what the next four weeks get built around.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      depends_on: ['w0_compile_first_week_stats'],
      optional: false,
      tags: ['analytics', 'followup'],
    },
    {
      id: 'w0_team_debrief',
      title: 'Debrief with the team: what worked across all three drops',
      description:
        'Run the debrief while it is fresh, comparing all three drops: single 1, single 2, and the album. The comparison is the most valuable thing this campaign produced.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'planning'],
    },
    {
      id: 'w0_top_content',
      title: 'Identify the top-performing content from the rollout',
      description:
        'Find the content that moved people across 21 weeks, and note the format so it can be repeated.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'analytics'],
    },
    {
      id: 'w0_thankyou_posts',
      title: 'Thank-you posts to curators, press, and collaborators',
      description:
        'Thank everyone who supported the campaign publicly. On an album that list is long, and these relationships are what the next record depends on.',
      role: 'artist',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'w0_update_tracker',
      title: 'Update the master release tracker',
      description:
        'Record the final numbers, the placements, and the contacts against all three drops.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'planning'],
    },

    // -----------------------------------------------------------------------
    // Week +1 — First Follow-Up Push [offset +8]
    // -----------------------------------------------------------------------
    {
      id: 'post_w1_followup_content',
      title: 'Post follow-up content',
      description:
        'Lyric videos, BTS, alternate edits, fan reposts. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 7,
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w1_next_focus_track',
      title: 'Push the standout track as the next focus track',
      description:
        'Give the standout track its own push: content, playlist pitches, and paid support if budget remains. This is the plan made at -35, now pointed at what the data actually showed.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 7,
      depends_on: ['w0_identify_standout_tracks', 'w5_plan_focus_tracks'],
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w1_secondary_editorial',
      title: 'Pitch secondary editorial playlists with first-week stats',
      description:
        'Go back to editorial with real album numbers, leading on the strongest track rather than the record as a whole.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 1,
      depends_on: ['w0_compile_first_week_stats'],
      optional: false,
      tags: ['followup', 'editorial'],
    },
    {
      id: 'post_w1_fan_engagement',
      title: 'Engage with fan posts and tags from release week',
      description:
        'Repost, comment, and share what fans made during release week.',
      role: 'artist',
      type: 'task',
      offset_days: 8,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w1_press_pickup',
      title: 'Check for blog and press pickup and amplify anything that landed',
      description:
        'Find the reviews and features that ran and amplify them. Album reviews arrive in the week after release, which is later than most managers keep looking.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week +2 — Sustained Momentum [offset +15]
    // -----------------------------------------------------------------------
    {
      id: 'post_w2_followup_content',
      title: 'Post follow-up content',
      description:
        'Live performances, acoustic versions, the story behind individual tracks. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 7,
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w2_mood_playlists',
      title: 'Pitch mood-based and genre-based playlists',
      description:
        'Pitch the strongest tracks to mood and genre playlists, which are far less competitive than editorial. An album gives you a dozen shots here.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'editorial'],
    },
    {
      id: 'post_w2_review_analytics',
      title: 'Review analytics: where listeners came from and which tracks hold them',
      description:
        'Look at sources and at per-track completion. On an album, which track keeps people listening to the end matters more than which got the most first plays.',
      role: 'manager',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      depends_on: ['w13_analytics_access'],
      optional: false,
      tags: ['followup', 'analytics'],
    },
    {
      id: 'post_w2_review_ads',
      title: 'Review ads performance',
      description:
        'Spend efficiency, top-performing creative, the audience that converted, and cost per save or stream across all three drops.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      optional: true,
      tags: ['followup', 'analytics'],
    },
    {
      id: 'post_w2_strongest_market',
      title: 'Identify the strongest market and consider geo-targeted content',
      description:
        'Find the market responding hardest and make something for it specifically.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week +3 — Deep Catalogue Push [offset +22]
    // -----------------------------------------------------------------------
    {
      id: 'post_w3_followup_content',
      title: 'Post follow-up content',
      description:
        'Milestone celebrations, listener stats shares, artist commentary. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 22,
      duration_days: 7,
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w3_third_single',
      title: 'Release the third single or a focus-track video',
      description:
        'If a third single was selected at -119 and teased at -21, this is where it lands: a fresh moment three weeks after release, when an album would otherwise be going quiet.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      depends_on: ['w17_select_singles'],
      optional: true,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w3_catalogue_playlists',
      title: 'Pitch the album to long-tail and catalogue playlists',
      description:
        'Pitch the playlists that take records rather than new releases. This is where album streams accumulate over months.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'editorial'],
    },
    {
      id: 'post_w3_listener_playlists',
      title: 'Review which tracks are being added to listener playlists',
      description:
        'Listener playlist adds are the strongest signal of which tracks have a life beyond the campaign. They should decide what gets pushed next.',
      role: 'manager',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      depends_on: ['w13_analytics_access'],
      optional: false,
      tags: ['followup', 'analytics'],
    },

    // -----------------------------------------------------------------------
    // Week +4 — Long Tail Setup [offset +29]
    // -----------------------------------------------------------------------
    {
      id: 'post_w4_followup_content',
      title: 'Post follow-up content',
      description:
        'Keep a cadence going into month two. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 29,
      duration_days: 7,
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w4_next_cycle',
      title: 'Decide the next cycle',
      description:
        'Deluxe edition, remixes, a tour, or the next project. Decide while the momentum and the data are both still live.',
      role: 'manager',
      type: 'task',
      offset_days: 29,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'planning'],
    },
    {
      id: 'post_w4_lessons_learned',
      title: 'Document lessons learned in the master release tracker',
      description:
        'Write down what you would do differently, especially about the gaps between the three drops. Those two gaps are the decisions this template is built around.',
      role: 'manager',
      type: 'task',
      offset_days: 29,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'planning'],
    },
    {
      id: 'post_w4_yearend_editorial',
      title: 'Submit to year-end, quarterly, and award considerations',
      description:
        'Albums are eligible for year-end lists and awards that singles are not. If the timing is relevant, submit now.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 29,
      duration_days: 1,
      optional: true,
      tags: ['followup', 'editorial'],
    },
  ],
};

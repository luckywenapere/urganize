/**
 * EP release template — v0.1.
 *
 * DRAFT, pending design-partner review. Single v0.3 was signed off by two
 * design partners; this has not had that pass, which is why it ships behind
 * NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES.
 *
 * Hand-crafted 16-week rollout: 13 weeks pre-release plus 3 weeks of
 * post-release follow-up. Two things separate it from the single playbook, and
 * they are the reason it exists:
 *
 * 1. Multi-track logic. Metadata, split sheets and the content shoot cover
 *    every track. They stay SINGLE tasks rather than one row per track — the
 *    tracklist is unknown at authoring time and the AI tailoring layer has no
 *    operation for adding tasks, so per-track rows would be either fabricated
 *    or missing.
 * 2. A staggered lead single with its own compressed rollout inside the EP
 *    runway, dropping at offset -42 (6 weeks before the EP). Its traction is
 *    the evidence used to pitch the EP to editorial at -35. That front half of
 *    the calendar is why the runway is 13 weeks and not the single's 8.
 *
 * `offset_days` is measured from the EP release date: negative = before,
 * zero = release day, positive = after. Tasks are anchored to the start of
 * their week (Week N -> offset = -7 * N); Week 1 carries the finer countdown
 * offsets (-7, -3, -1), release day sits at 0, the wrap-up week at +1, and
 * follow-up Weeks +1/+2/+3 at +8, +15, +22.
 *
 * Source of truth: ./ep-v0.1.md.
 *
 * @see CLAUDE.md "Hand-crafted release templates" section
 */

import type { Template } from './types';

export const EP_RELEASE_TEMPLATE: Template = {
  id: 'ep_v0.1',
  release_type: 'ep',
  name: 'EP Release: 16 Week Rollout',
  description:
    '13 weeks of pre-release work plus 3 weeks of post-release follow-up, built around a lead single that drops 6 weeks ahead of the EP. Designed for independent managers handling a multi-track project.',
  default_duration_days: 113,
  version: '0.1.0',
  tasks: [
    // -----------------------------------------------------------------------
    // Week 13 — EP Strategy & Tracklist (Days 1-7) [offset -91]
    // -----------------------------------------------------------------------
    {
      id: 'w13_lock_tracklist',
      title: 'Lock the tracklist and running order',
      description:
        'Decide which tracks make the EP and in what order. Sequencing is a creative decision that everything downstream depends on: metadata, artwork briefs, and which track carries the campaign.',
      role: 'artist',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'asset_production'],
    },
    {
      id: 'w13_lock_all_masters',
      title: 'Lock all masters for every track',
      description:
        'Confirm the final mix and mastered version of every track on the EP is delivered and signed off. These are the files that go to the distributor. No further edits after this point — on any track.',
      role: 'artist',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w13_pick_lead_single',
      title: 'Pick the lead single',
      description:
        'Choose the track that goes out 6 weeks ahead of the EP. It carries the campaign: it earns the editorial relationships and the streaming evidence that the EP pitch is built on. Pick for reach, not for personal favourite.',
      role: 'manager',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      depends_on: ['w13_lock_tracklist'],
      optional: false,
      tags: ['planning', 'marketing'],
    },
    {
      id: 'w13_confirm_release_date',
      title: 'Confirm the EP release date and lock it',
      description:
        'Lock the public EP release date with the artist and team. Every downstream task, including the lead single drop, is anchored to this date.',
      role: 'manager',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w13_choose_distributor',
      title: 'Choose distributor and confirm the account is active',
      description:
        'Pick the distributor and verify the account is active, billing is current, and the artist profile is set up. Confirm it supports a multi-track release and a staggered single from the same project.',
      role: 'manager',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      optional: false,
      tags: ['distribution', 'planning'],
    },
    {
      id: 'w13_set_budget',
      title: 'Set the rollout budget across the lead single and the EP',
      description:
        'Split the budget (ads, design, PR, content) between the lead single push and the EP push. The common mistake is spending it all on the single and having nothing left for the project it was meant to sell.',
      role: 'manager',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w13_brief_marketing_lead',
      title: 'Brief the marketing lead on the EP',
      description:
        'Walk the marketing lead through the project: themes, story, target audience, and the sequencing logic. Owner: manager with artist input.',
      role: 'manager',
      type: 'task',
      offset_days: -91,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 12 — Paperwork & Lead Single Delivery (Days 8-14) [offset -84]
    // -----------------------------------------------------------------------
    {
      id: 'w12_write_ep_metadata',
      title: 'Write metadata for every track',
      description:
        'Title, ISRC if pre-assigned, songwriter splits, producer credits, and language — for every track, not just the single. One row per track in your own sheet; this task is done when the whole EP is covered.',
      role: 'manager',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      depends_on: ['w13_lock_tracklist'],
      optional: false,
      tags: ['planning', 'distribution'],
    },
    {
      id: 'w12_draft_split_sheets',
      title: 'Draft split sheets for every track and circulate',
      description:
        'One split sheet per track, circulated to every contributor on that track. Multi-track projects are where splits go wrong: a producer on three of six tracks needs three sheets, not one.',
      role: 'manager',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      depends_on: ['w13_lock_tracklist'],
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w12_upload_lead_single',
      title: 'Upload the lead single to the distributor',
      description:
        'Deliver the lead single as its own release, 6 weeks before its drop date. It needs the full distributor lead time in its own right — treat it as a real single release, not a preview of the EP.',
      role: 'manager',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      depends_on: ['w13_lock_all_masters', 'w13_pick_lead_single', 'w12_write_ep_metadata'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w12_brief_single_art',
      title: 'Brief the designer on lead single artwork',
      description:
        'The lead single needs its own cover that still reads as part of the EP world. Brief concept, references, and dimensions, and say plainly how it should relate to the EP art coming later.',
      role: 'manager',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w12_identify_playlists',
      title: 'Identify priority playlists and curators for the lead single',
      description:
        'Pick 3 to 5 priority playlists or curators for the single. These are the relationships the EP pitch will lean on later, so choose ones that plausibly cover the whole project, not just this one track.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w12_plan_content_shoot',
      title: 'Plan the EP content shoot',
      description:
        'Plan one shoot that covers every track, not just the single: BTS, performance clips, promo stills, and per-track visual ideas. One shoot day for the whole project is far cheaper than revisiting it per track.',
      role: 'manager',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      optional: false,
      tags: ['asset_production', 'planning'],
    },
    {
      id: 'w12_physical_formats',
      title: 'Physical formats production',
      description:
        'If vinyl, CD, or cassette is part of this EP, begin manufacturing now — production alone runs 8 to 12 weeks and is the one deadline that cannot be compressed later.',
      role: 'manager',
      type: 'task',
      offset_days: -84,
      duration_days: 1,
      optional: true,
      tags: ['asset_production', 'physical'],
    },

    // -----------------------------------------------------------------------
    // Week 11 — Lead Single Editorial Push (Days 15-21) [offset -77]
    // -----------------------------------------------------------------------
    {
      id: 'w11_confirm_single_accepted',
      title: 'Confirm the distributor accepted the lead single',
      description:
        'Check the submission went through with no metadata errors. If it was rejected, resubmit immediately — the single drop date has the EP calendar stacked behind it and cannot slip quietly.',
      role: 'manager',
      type: 'task',
      offset_days: -77,
      duration_days: 1,
      depends_on: ['w12_upload_lead_single'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w11_single_art_approved',
      title: 'Lead single artwork final approved',
      description:
        'Sign off the final single cover. It goes to the distributor, every DSP, and every promo asset from here on.',
      role: 'artist',
      type: 'task',
      offset_days: -77,
      duration_days: 1,
      depends_on: ['w12_brief_single_art'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w11_single_editorial_pitch',
      title: 'Submit the lead single editorial pitch',
      description:
        'Pitch through Spotify for Artists with the private link and final assets. Frame it as the first track from a forthcoming EP: editorial teams weigh a project higher than a one-off, and this is where that context starts paying.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -77,
      duration_days: 1,
      depends_on: ['w11_confirm_single_accepted'],
      optional: false,
      tags: ['editorial', 'marketing'],
    },
    {
      id: 'w11_brief_designer_ep_art',
      title: 'Brief the designer on EP cover art',
      description:
        'Brief the EP cover: concept, references, dimensions, and how it relates to the single art already in production. This is the asset every later channel pulls from, so it starts now rather than after the single drops.',
      role: 'manager',
      type: 'task',
      offset_days: -77,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w11_single_curator_outreach',
      title: 'Begin curator outreach for the lead single',
      description:
        'Start working the priority list with a private link. Rolling work across the week, not a single send.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -77,
      duration_days: 7,
      depends_on: ['w12_identify_playlists'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w11_split_signatures',
      title: 'Finalize split sheet signatures for every track',
      description:
        'Chase every contributor on every track until each sheet is signed. Unsigned splits on an EP become a royalty dispute across multiple tracks at once.',
      role: 'manager',
      type: 'task',
      offset_days: -77,
      duration_days: 1,
      depends_on: ['w12_draft_split_sheets'],
      optional: false,
      tags: ['planning'],
    },

    // -----------------------------------------------------------------------
    // Week 10 — Content Production & Pre-save (Days 22-28) [offset -70]
    // -----------------------------------------------------------------------
    {
      id: 'w10_content_shoot',
      title: 'EP content shoot executed',
      description:
        'Shoot the whole project in one go: promo videos, photos, social clips, and per-track material. Come away with enough to cover the single rollout, the EP rollout, and the post-release tail.',
      role: 'artist',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      depends_on: ['w12_plan_content_shoot'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w10_single_presave_setup',
      title: 'Set up the lead single pre-save link',
      description:
        'Build the pre-save now the distributor has accepted the single. Capture the audience here: these are the people you will point at the EP in 6 weeks.',
      role: 'manager',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      depends_on: ['w11_confirm_single_accepted'],
      optional: false,
      tags: ['marketing', 'distribution'],
    },
    {
      id: 'w10_single_presave_live',
      title: 'Lead single pre-save campaign goes live',
      description:
        'Push the pre-save publicly across socials and the mailing list.',
      role: 'manager',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      depends_on: ['w10_single_presave_setup'],
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w10_ep_art_draft',
      title: 'EP cover art first draft delivered',
      description:
        'First pass at the EP cover, for review against the single art already approved.',
      role: 'designer',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      depends_on: ['w11_brief_designer_ep_art'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w10_announce_single',
      title: 'Announce the lead single release date on socials',
      description:
        'Announce the single and say plainly that an EP follows. Every piece of single promotion from here should carry that fact.',
      role: 'artist',
      type: 'task',
      offset_days: -70,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w10_trim_footage',
      title: 'Begin trimming shoot footage into promo edits',
      description:
        'Cut the shoot into edits, tagged by which track each one belongs to. Rolling work across the week. Sorting them by track now is what makes the post-release track-by-track push cheap later.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -70,
      duration_days: 7,
      depends_on: ['w10_content_shoot'],
      optional: false,
      tags: ['asset_production', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 9 — Lead Single Ramp (Days 29-35) [offset -63]
    // -----------------------------------------------------------------------
    {
      id: 'w9_single_teasers',
      title: 'Lead single teaser content begins',
      description:
        'Start the teaser cadence for the single: one piece every 2 to 3 days. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -63,
      duration_days: 7,
      depends_on: ['w10_trim_footage'],
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w9_single_curator_followup',
      title: 'Follow up on lead single curator outreach',
      description:
        'Chase the curators who have not replied. A follow-up converts far more often than the first send.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -63,
      duration_days: 1,
      depends_on: ['w11_single_curator_outreach'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w9_ep_art_approved',
      title: 'EP cover art final approved',
      description:
        'Sign off the final EP cover. The distributor upload in Week 5 is blocked until this exists.',
      role: 'artist',
      type: 'task',
      offset_days: -63,
      duration_days: 1,
      depends_on: ['w10_ep_art_draft'],
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w9_single_snippet',
      title: 'Snippet of the lead single on TikTok/Reels',
      description:
        'Put the hook in front of people on the platforms where discovery actually happens.',
      role: 'artist',
      type: 'task',
      offset_days: -63,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w9_brief_pr',
      title: 'Brief PR contacts on the EP campaign',
      description:
        'Brief press on the whole project, not just the single — the EP is the story worth covering, and the single is the hook to open on.',
      role: 'manager',
      type: 'task',
      offset_days: -63,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 8 — Lead Single Release Prep (Days 36-42) [offset -56]
    // -----------------------------------------------------------------------
    {
      id: 'w8_schedule_single_posts',
      title: 'Schedule lead single release-day posts',
      description:
        'Queue the single drop-day posts across every platform so release day is execution, not composition.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w8_confirm_single_placements',
      title: 'Confirm lead single playlist placements',
      description:
        'Confirm the placements that came back positive, and note which curators to return to for the EP.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      depends_on: ['w9_single_curator_followup'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w8_single_presave_reminder',
      title: 'Pre-save reminder to the mailing list',
      description:
        'Last call on the single pre-save before drop day.',
      role: 'manager',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w8_single_ads',
      title: 'Final push on lead single ads',
      description:
        'If the budget allows, run paid support into the single drop — and keep the EP share of the budget intact.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: true,
      tags: ['marketing', 'paid'],
    },
    {
      id: 'w8_confirm_ep_window',
      title: 'Confirm the EP upload window with the distributor',
      description:
        'Confirm the EP delivery deadline for the locked release date, while the single is still fresh in that conversation. Uploading an EP while a single from the same project is live sometimes needs a specific setup.',
      role: 'manager',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['distribution'],
    },

    // -----------------------------------------------------------------------
    // Week 7 — Lead Single Countdown (Days 43-49) [offset -49]
    // -----------------------------------------------------------------------
    {
      id: 'w7_single_countdown',
      title: 'Countdown content for the lead single',
      description:
        'Run the countdown into the single drop. Rolling work across the week.',
      role: 'artist',
      type: 'task',
      offset_days: -49,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w7_single_stories',
      title: 'Prepare lead single release-day stories and posts',
      description:
        'Have the drop-day story sequence built and queued before the day arrives.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w7_analytics_access',
      title: 'Set up Spotify and Apple Music for Artists access',
      description:
        'Get analytics access in place before the single drops. It is the baseline that both the single and the EP get measured against.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: false,
      tags: ['analytics', 'planning'],
    },

    // -----------------------------------------------------------------------
    // Week 6 — LEAD SINGLE DROP (Days 50-56) [offset -42]
    // -----------------------------------------------------------------------
    {
      id: 'w6_lead_single_drop',
      title: 'Lead single drops: post across all platforms',
      description:
        'The lead single is out. Post the drop announcement everywhere, and make sure every post names the EP and its date.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: -42,
      duration_days: 1,
      depends_on: ['w11_confirm_single_accepted'],
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },
    {
      id: 'w6_monitor_single_golive',
      title: 'Monitor the distributor for lead single go-live',
      description:
        'Check the single is live across every DSP and that the artwork, credits, and artist profile all resolved correctly.',
      role: 'manager',
      type: 'event_milestone',
      offset_days: -42,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'distribution', 'event'],
    },
    {
      id: 'w6_single_thankyou',
      title: 'Thank-you content and early stats to the team',
      description:
        'Thank the people who showed up, and share the first numbers with the team.',
      role: 'artist',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w6_single_first_numbers',
      title: "Compile the lead single's first-48-hours numbers",
      description:
        'Streams, saves, playlist adds, and top markets in the first 48 hours. This is the evidence the EP editorial pitch is built on, so capture it properly rather than glancing at it.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      depends_on: ['w7_analytics_access'],
      optional: false,
      tags: ['analytics'],
    },
    {
      id: 'w6_single_fan_engagement',
      title: 'Engage with fan posts and tags from the single drop',
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
    // Week 5 — EP Delivery & Announcement (Days 57-63) [offset -35]
    // -----------------------------------------------------------------------
    {
      id: 'w5_upload_ep_to_distributor',
      title: 'Upload the EP to the distributor',
      description:
        'Deliver every track and its metadata. This is the central pre-release gate: every DSP delivery downstream waits on it, and metadata errors only surface after submission. On a multi-track release there are more fields to get wrong, so leave time for a resubmission.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w13_lock_all_masters', 'w12_write_ep_metadata', 'w9_ep_art_approved'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w5_upload_ep_art',
      title: 'Upload EP cover art to the distributor',
      description:
        'Deliver the approved EP cover at the required dimensions.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w9_ep_art_approved'],
      optional: false,
      tags: ['distribution', 'asset_production'],
    },
    {
      id: 'w5_announce_ep',
      title: 'Announce the EP with the tracklist reveal',
      description:
        'Announce the EP, the date, and the tracklist. The single is live and working, so this lands on an audience that already has a reason to care.',
      role: 'artist',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w5_ep_editorial_pitch',
      title: 'Pitch the EP to editorial with lead single traction as evidence',
      description:
        'Pitch the EP with the single\'s real numbers attached: streams, saves, playlist adds, and where the listeners are. Five weeks out keeps you inside the editorial window. This evidence is the whole reason the single went first.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w6_single_first_numbers'],
      optional: false,
      tags: ['editorial', 'marketing'],
    },
    {
      id: 'w5_review_single_performance',
      title: 'Review lead single performance and adjust the EP plan',
      description:
        'Look honestly at what the single did: which markets, which content, which playlists. Move the EP budget and content plan toward what actually worked rather than what was planned.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w6_single_first_numbers'],
      optional: false,
      tags: ['analytics', 'planning'],
    },
    {
      id: 'w5_identify_ep_playlists',
      title: 'Identify priority playlists and curators for the EP',
      description:
        'Build the EP list, starting with the curators who supported the single. A warm relationship is worth more than a bigger cold playlist.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w5_confirm_ep_date_locked',
      title: 'Confirm the EP release date is locked at the distributor',
      description:
        'Verify the date at the distributor matches the date you are promoting.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w5_upload_ep_to_distributor'],
      optional: false,
      tags: ['distribution'],
    },

    // -----------------------------------------------------------------------
    // Week 4 — EP Pre-save & Editorial (Days 64-70) [offset -28]
    // -----------------------------------------------------------------------
    {
      id: 'w4_confirm_ep_accepted',
      title: 'Confirm the distributor accepted the EP',
      description:
        'Check every track went through with no metadata errors. If anything was rejected, resubmit immediately — a single rejected track can hold the whole release.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      depends_on: ['w5_upload_ep_to_distributor'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w4_ep_presave_setup',
      title: 'Set up the EP pre-save link',
      description:
        'Build the EP pre-save now the distributor has accepted, and point the single\'s pre-save audience at it.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      depends_on: ['w4_confirm_ep_accepted'],
      optional: false,
      tags: ['marketing', 'distribution'],
    },
    {
      id: 'w4_ep_presave_live',
      title: 'EP pre-save campaign goes live',
      description:
        'Push the EP pre-save publicly, leading with the single that is already out.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      depends_on: ['w4_ep_presave_setup'],
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w4_ep_curator_outreach',
      title: 'Begin EP curator outreach with a private link',
      description:
        'Work the EP list with a private link. Rolling work across the week. Return to the single\'s supporters first.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -28,
      duration_days: 7,
      depends_on: ['w5_identify_ep_playlists'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w4_send_press_release',
      title: 'Send the EP press release to contacts',
      description:
        'Send the release to press, with the single\'s numbers as the reason to pay attention.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w4_plan_focus_track',
      title: 'Plan a second focus track to push after release',
      description:
        'Decide now which track gets the push after release day. Planning it before the noise of release week is what stops an EP going quiet 10 days after it lands.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      depends_on: ['w13_lock_tracklist'],
      optional: false,
      tags: ['planning', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 3 — Marketing Ramp (Days 71-77) [offset -21]
    // -----------------------------------------------------------------------
    {
      id: 'w3_ep_teaser_rollout',
      title: 'EP teaser content rollout begins',
      description:
        'Start the EP teaser cadence: one piece every 2 to 3 days. Rolling work across the week. This is what carries the audience from the announcement to release day.',
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
        'Give each track its own moment in the run-up using the per-track edits from the shoot. Rolling work across the week. This is the EP-specific move a single rollout has no equivalent for.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 7,
      depends_on: ['w10_trim_footage'],
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w3_ep_curator_followup',
      title: 'Follow up on EP curator outreach',
      description:
        'Chase the curators who have not replied on the EP.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      depends_on: ['w4_ep_curator_outreach'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w3_confirm_events',
      title: 'Confirm any release-day events',
      description:
        'Lock whatever is happening on the day: listening session, IG live, in-store, or nothing at all.',
      role: 'manager',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      optional: false,
      tags: ['event', 'planning'],
    },
    {
      id: 'w3_schedule_release_posts',
      title: 'Schedule EP release-day social posts',
      description:
        'Queue the release-day posts across every platform.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 2 — Final Prep (Days 78-84) [offset -14]
    // -----------------------------------------------------------------------
    {
      id: 'w2_listening_party',
      title: 'Listening party or IG live planned',
      description:
        'If you are doing one, plan it now: date, platform, guest list, and what gets played. An EP gives you a full listen to build the event around.',
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
      id: 'w2_confirm_ep_placements',
      title: 'Confirm EP playlist placements',
      description:
        'Confirm which EP placements came back positive so release-day messaging can point at them.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -14,
      duration_days: 1,
      depends_on: ['w3_ep_curator_followup'],
      optional: false,
      tags: ['marketing', 'editorial'],
    },

    // -----------------------------------------------------------------------
    // Week 1 — Release Week (Days 85-91) [offset -7 / -3 / -1]
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
        'If the budget allows, run paid support into release day.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -3,
      duration_days: 1,
      optional: true,
      tags: ['marketing', 'paid'],
    },
    {
      id: 'w1_presave_reminder',
      title: '1 day out: pre-save reminder to fans',
      description:
        'Last call on the EP pre-save to the mailing list and socials.',
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
      title: 'Release day: post the EP drop announcement across all platforms',
      description:
        'The EP is out. Post everywhere, and point people at the full listen rather than only the single they already know.',
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
        'Check every track is live on every DSP, in the right order, with the right credits and artwork. Track order and per-track credits are the two things that go wrong on a multi-track release.',
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
        'Streams, saves, playlist adds, and top markets — for the EP as a whole and broken down per track. The per-track split is what tells you which song to push next.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      depends_on: ['w7_analytics_access'],
      optional: false,
      tags: ['analytics', 'followup'],
    },
    {
      id: 'w0_identify_standout_track',
      title: 'Identify the standout track by streams and saves',
      description:
        'Find the track the audience actually chose. It is often not the lead single, and it is the one that earns the next push.',
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
      title: "Debrief with the team: what worked, what didn't",
      description:
        'Run the debrief while it is fresh, and cover both halves: the single rollout and the EP rollout.',
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
        'Find the content that actually moved people across the whole campaign, and note the format so it can be repeated.',
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
        'Thank everyone who supported the release publicly. These are the relationships the next project depends on.',
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
        'Record the final numbers, the placements, and the contacts against this release.',
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
        'Lyric videos, BTS, alternate edits, fan reposts. Cadence is per day or per week depending on artist scale. Rolling work across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 7,
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w1_second_focus_track',
      title: 'Push the standout track as the second focus track',
      description:
        'Give the standout track its own push: content, playlist pitches, and paid support if there is budget left. This is what gives an EP a second life a single never gets.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 7,
      depends_on: ['w0_identify_standout_track', 'w4_plan_focus_track'],
      optional: false,
      tags: ['followup', 'marketing'],
    },
    {
      id: 'post_w1_secondary_editorial',
      title: 'Pitch secondary editorial playlists with first-week stats',
      description:
        'Go back to editorial with real numbers, leading on the strongest track rather than the EP as a whole.',
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
        'Pitch the strongest tracks to mood and genre playlists, which are far less competitive than editorial. An EP gives you several shots here rather than one.',
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
        'Look at sources and at per-track completion. Which track keeps people listening matters more than which one got the most first plays.',
      role: 'manager',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      depends_on: ['w7_analytics_access'],
      optional: false,
      tags: ['followup', 'analytics'],
    },
    {
      id: 'post_w2_review_ads',
      title: 'Review ads performance',
      description:
        'Spend efficiency, top-performing creative, the audience that converted, and cost per save or stream.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      optional: true,
      tags: ['followup', 'analytics', 'marketing', 'paid'],
    },

    // -----------------------------------------------------------------------
    // Week +3 — Long Tail Setup [offset +22]
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
      id: 'post_w3_next_cycle',
      title: 'Decide the next cycle',
      description:
        'Next single from this EP, a deluxe edition, or the next project. Decide while the momentum and the data are both still live.',
      role: 'manager',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'planning'],
    },
    {
      id: 'post_w3_lessons_learned',
      title: 'Document lessons learned in the master release tracker',
      description:
        'Write down what you would do differently, especially about the gap between the single and the EP. That gap is the decision this template is built around.',
      role: 'manager',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      optional: false,
      tags: ['followup', 'planning'],
    },
    {
      id: 'post_w3_yearend_editorial',
      title: 'Submit to year-end and quarterly editorial considerations',
      description:
        'If the timing is relevant, submit for year-end and quarterly editorial roundups.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      optional: true,
      tags: ['followup', 'editorial'],
    },
  ],
};

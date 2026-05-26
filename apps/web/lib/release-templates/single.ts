/**
 * Single release template — v0.3.
 *
 * Hand-crafted 11-week rollout for an independent music manager handling a
 * single drop. 8 weeks of pre-release work (Day 1 → Day 56 = release day)
 * plus 3 weeks of post-release follow-up (Day 57 → Day 84).
 *
 * `offset_days` is measured from the release date: negative = before release,
 * zero = release day, positive = after release. Most tasks are anchored to
 * the start of their week (Week N → offset = -7 * N); Week 1 has finer-grained
 * countdown offsets (-7, -3, -1) and the post-release follow-up weeks are
 * anchored to +8, +15, +22.
 *
 * @see CLAUDE.md "Hand-crafted release templates" section
 */

import type { Template } from './types';

export const SINGLE_RELEASE_TEMPLATE: Template = {
  id: 'single_v0.3',
  release_type: 'single',
  name: 'Single Release — 11 Week Rollout',
  description:
    '8 weeks of pre-release work plus 3 weeks of post-release follow-up. Designed for independent managers handling a single drop.',
  default_duration_days: 84,
  version: '0.3.0',
  tasks: [
    // -----------------------------------------------------------------------
    // Week 8 — Kickoff (offset -56)
    // -----------------------------------------------------------------------
    {
      id: 'w8_lock_master',
      title: 'Lock the master file',
      description:
        'Confirm the final mixed and mastered audio file is delivered and signed off. This is the file that goes to the distributor — no further edits after this point.',
      role: 'artist',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w8_confirm_release_date',
      title: 'Confirm release date',
      description:
        'Lock in the public release date with the artist and team. Every downstream task is anchored to this date.',
      role: 'manager',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },

    // -----------------------------------------------------------------------
    // Week 7 (offset -49)
    // -----------------------------------------------------------------------
    {
      id: 'w7_brief_designer',
      title: 'Brief designer on cover art',
      description:
        'Send the designer the track, mood references, artist direction, and dimensions for cover art. Agree on a delivery date for the first draft.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: false,
      tags: ['asset_production', 'planning'],
    },
    {
      id: 'w7_decide_presave_campaign',
      title: 'Decide whether to do a pre-save campaign',
      description:
        'Make a call on whether this release will have a pre-save campaign. The decision affects downstream link setup, ad spend, and release-week messaging.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'marketing'],
    },
    {
      id: 'w7_physical_formats',
      title: 'Physical formats production',
      description:
        'If shipping physical formats (vinyl, CDs, cassettes), kick off production now. Lead times are 6+ weeks for vinyl in most regions.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: true,
      tags: ['asset_production'],
    },

    // -----------------------------------------------------------------------
    // Week 6 (offset -42)
    // -----------------------------------------------------------------------
    {
      id: 'w6_cover_art_first_draft',
      title: 'Cover art first draft delivered',
      description:
        'Designer delivers the first round of cover art for review. Expect at least one revision round before final approval next week.',
      role: 'designer',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w6_upload_to_distributor',
      title: 'Upload track and metadata to distributor',
      description:
        'Submit the locked master, track metadata (ISRC, songwriters, splits, language, explicit flag), and release date to the distributor. Cover art can follow once approved.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      depends_on: ['w8_lock_master'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w6_setup_presave',
      title: 'Set up pre-save link',
      description:
        'Generate the pre-save / smart link via your tool of choice (Linkfire, Feature.fm, etc.) so it is ready to share once the distributor accepts the submission.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      optional: true,
      tags: ['distribution', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 5 (offset -35; one buffer task at -33)
    // -----------------------------------------------------------------------
    {
      id: 'w5_upload_cover_art',
      title: 'Upload cover art to distributor',
      description:
        'Once approved internally, upload the final cover art file to the distributor with the correct dimensions and color profile.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w6_cover_art_first_draft'],
      optional: false,
      tags: ['distribution', 'asset_production'],
    },
    {
      id: 'w5_cover_art_final_approved',
      title: 'Cover art final approved',
      description:
        'Artist and manager sign off on the final cover art. Same file used everywhere — distributor, social, press, merch.',
      role: 'artist',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w5_confirm_distributor_accepted',
      title: 'Confirm distributor accepted submission with no metadata errors',
      description:
        '+2 day buffer after upload. Log in to the distributor dashboard and verify the submission is accepted, in review, and free of metadata errors. Catch problems now, not on release day.',
      role: 'manager',
      type: 'task',
      offset_days: -33,
      duration_days: 1,
      depends_on: ['w6_upload_to_distributor'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w5_presave_live',
      title: 'Pre-save campaign goes live',
      description:
        'Publish the pre-save link and start sharing across artist channels. Requires the distributor to have accepted the submission so the link resolves correctly.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w6_setup_presave', 'w5_confirm_distributor_accepted'],
      optional: true,
      tags: ['marketing', 'distribution'],
    },
    {
      id: 'w5_editorial_pitch',
      title: 'Editorial playlist pitch with final assets',
      description:
        'Pitch the track to editorial playlists (Spotify for Artists, Apple Music for Artists, Amazon, Audiomack, etc.) with final cover art, story, and release date.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w5_cover_art_final_approved'],
      optional: false,
      tags: ['editorial', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 4 (offset -28)
    // -----------------------------------------------------------------------
    {
      id: 'w4_teaser_rollout',
      title: 'Begin teaser content rollout (1 piece every 2-3 days)',
      description:
        'Start posting teaser content — short clips, behind-the-scenes, mood pieces. Cadence of one piece every 2–3 days across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -28,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w4_curator_outreach',
      title: 'Begin curator/playlist outreach',
      description:
        'Reach out to independent playlist curators, blog editors, and tastemaker accounts. Personalize each pitch with the track, cover, and release date.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 7,
      optional: false,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w4_trim_footage',
      title: 'Begin trimming content shoot footage',
      description:
        'Cut down content shoot footage into the assets needed for the release-week rollout: countdown clips, drop-day post, thank-you reel.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -28,
      duration_days: 7,
      optional: false,
      tags: ['asset_production', 'marketing'],
    },
    {
      id: 'w4_brief_pr_contacts',
      title: 'Brief any PR contacts on release',
      description:
        'Send a heads-up brief to any press, PR, or blog contacts who might cover the release. Include the one-liner, cover art, release date, and the angle.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 3 (offset -21)
    // -----------------------------------------------------------------------
    {
      id: 'w3_increase_teaser_frequency',
      title: 'Increase teaser content frequency',
      description:
        'Step up the teaser cadence — daily posts, more channels, more variation. The release is now visible on the horizon and momentum should be building.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w3_followup_curator_outreach',
      title: 'Follow up on curator outreach',
      description:
        'Nudge curators and contacts who did not respond to the first round. Send the final cover art and any new traction (early teaser engagement, pre-save numbers).',
      role: 'manager',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      optional: true,
      tags: ['marketing', 'editorial'],
    },
    {
      id: 'w3_send_press_release',
      title: 'Send press release / blurb to any contacts',
      description:
        'Send the formal press release or short blurb to press contacts who confirmed interest. Embargo the release date if useful.',
      role: 'manager',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 1 (countdown — finer-grained offsets at -7, -3, -1)
    // -----------------------------------------------------------------------
    {
      id: 'w1_countdown_content',
      title: '7 days out: countdown content begins',
      description:
        'Start the explicit countdown — "7 days", "6 days", etc. Pin a release post. Switch artist bios and profile art to release-week assets.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -7,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w1_final_push_ads',
      title: '3 days out: final push, ads start (if budget allows)',
      description:
        'Final marketing push: heaviest posting cadence of the rollout, plus paid ads if budget allows (Meta, TikTok, YouTube pre-roll, etc.).',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -3,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'w1_listening_party',
      title: 'Listening party or IG live planned (if doing one)',
      description:
        'Hold the listening party, IG Live, or fan moment — typically a few days before drop. Dated point on the release timeline rather than ongoing work.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: -3,
      duration_days: 1,
      optional: true,
      tags: ['event', 'marketing'],
    },
    {
      id: 'w1_presave_reminder',
      title: '1 day out: pre-save reminder',
      description:
        'Final reminder to the audience to pre-save the track. Last call before release day — story posts, DMs to top supporters.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -1,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },

    // -----------------------------------------------------------------------
    // Release day (offset 0) — event milestones
    // -----------------------------------------------------------------------
    {
      id: 'release_day_announcement',
      title: 'Release day: post drop announcement',
      description:
        'Post the drop announcement across every artist channel — IG, TikTok, X, YouTube, mailing list. The single is live.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: 0,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },
    {
      id: 'release_day_monitor_distributor',
      title: 'Release day: monitor distributor for go-live',
      description:
        'Watch the distributor dashboard and DSPs to confirm the single is live everywhere. Catch and escalate any platform-specific delays.',
      role: 'manager',
      type: 'event_milestone',
      offset_days: 0,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'distribution', 'event'],
    },
    {
      id: 'release_day_thankyou_content',
      title: 'Release day: thank-you content',
      description:
        'Post thank-you content to the audience, team, collaborators, and curators. Reinforces the drop and rewards everyone who shared.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: 0,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },

    // -----------------------------------------------------------------------
    // Week +1 (offset 8)
    // -----------------------------------------------------------------------
    {
      id: 'post_w1_followup_content',
      title: 'Post 2-3 pieces of follow-up content',
      description:
        'Keep the conversation going through Week +1 — reaction clips, behind-the-scenes from release day, early stats screenshots, fan reposts.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 7,
      optional: false,
      tags: ['marketing', 'followup'],
    },
    {
      id: 'post_w1_review_ads',
      title: 'Review ads performance',
      description:
        'If ads ran during the rollout, review performance — spend, reach, conversion to pre-saves and streams. Document learnings for the next release.',
      role: 'manager',
      type: 'task',
      offset_days: 8,
      duration_days: 1,
      optional: true,
      tags: ['analytics', 'followup'],
    },

    // -----------------------------------------------------------------------
    // Week +2 (offset 15)
    // -----------------------------------------------------------------------
    {
      id: 'post_w2_followup_content',
      title: 'Post 2-3 pieces of follow-up content',
      description:
        'Sustain visibility in Week +2 — playlist adds, milestones hit, second-wave clips, live performance previews if applicable.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 7,
      optional: false,
      tags: ['marketing', 'followup'],
    },

    // -----------------------------------------------------------------------
    // Week +3 (offset 22)
    // -----------------------------------------------------------------------
    {
      id: 'post_w3_followup_content',
      title: 'Post 2-3 pieces of follow-up content',
      description:
        'Final week of active rollout — wrap the campaign with a third pass of content that bridges into whatever comes next (tour, next single, EP tease).',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 22,
      duration_days: 7,
      optional: false,
      tags: ['marketing', 'followup'],
    },
  ],
};

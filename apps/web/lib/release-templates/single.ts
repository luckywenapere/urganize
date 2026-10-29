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
 * countdown offsets (-7, -3, -1, 0), Week 5 has one +2-day buffer task at -33,
 * Week 0 (release-week wrap-up) sits at +1, and follow-up Weeks +1/+2/+3 are
 * anchored to +8, +15, +22.
 *
 * Source of truth: ./single-v0.3.md.
 *
 * @see CLAUDE.md "Hand-crafted release templates" section
 */

import type { Template } from './types';

export const SINGLE_RELEASE_TEMPLATE: Template = {
  id: 'single_v0.3',
  release_type: 'single',
  name: 'Single Release: 11 Week Rollout',
  description:
    '8 weeks of pre-release work plus 3 weeks of post-release follow-up. Designed for independent managers handling a single drop.',
  default_duration_days: 84,
  version: '0.3.0',
  tasks: [
    // -----------------------------------------------------------------------
    // Week 8 — Pre-Production & Strategy (Days 1-7) [offset -56]
    // -----------------------------------------------------------------------
    {
      id: 'w8_lock_master',
      title: 'Lock the master file',
      description:
        'Confirm the final mix and final mastered version are delivered and signed off. This is the file that goes to the distributor. No further edits after this point.',
      role: 'artist',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w8_confirm_release_date',
      title: 'Confirm release date and lock it',
      description:
        'Lock in the public release date with the artist and team. Every downstream task is anchored to this date.',
      role: 'manager',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w8_choose_distributor',
      title: 'Choose distributor and confirm account is active',
      description:
        'Pick the distributor (DistroKid, TuneCore, EMPIRE, Believe, etc.) and verify the account is active, billing is current, and the artist profile is set up.',
      role: 'manager',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['distribution', 'planning'],
    },
    {
      id: 'w8_brief_marketing_lead',
      title: 'Brief the marketing lead on the song',
      description:
        'Walk the marketing lead through the song: theme, story, target audience, mood. Owner: manager with artist input.',
      role: 'manager',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'marketing'],
    },
    {
      id: 'w8_set_rollout_budget',
      title: 'Set rollout budget',
      description:
        'Decide spend allocation across ads, design, PR, content, and any miscellaneous rollout costs. The budget drives downstream decisions on physical formats, ads, and PR scope.',
      role: 'manager',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w8_identify_priority_playlists',
      title: 'Identify 3 priority playlists/curators to pitch',
      description:
        'Pick the top three playlists or curators to prioritize for outreach. Specific targets make the editorial and curator workflows downstream much more focused.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -56,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'editorial', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 7 — Asset Planning (Days 8-14) [offset -49]
    // -----------------------------------------------------------------------
    {
      id: 'w7_brief_designer',
      title: 'Brief designer on cover art',
      description:
        'Send the designer the concept, references, and dimensions for cover art. Agree on a delivery date for the first draft (Week 6).',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: false,
      tags: ['asset_production', 'planning'],
    },
    {
      id: 'w7_plan_content_shoot',
      title: 'Plan content shoot day',
      description:
        'Plan the content shoot day: behind-the-scenes, performance clips, promo. Pick a date, location, and shot list so the shoot in Week 6 produces the assets needed for the rollout.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'asset_production'],
    },
    {
      id: 'w7_write_song_metadata',
      title: 'Write song metadata',
      description:
        'Write the song metadata: title, ISRC if pre-assigned, songwriter splits, producer credits, language. Owner: manager with artist input.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: false,
      tags: ['distribution', 'planning'],
    },
    {
      id: 'w7_draft_split_sheet',
      title: 'Draft split sheet and circulate to all contributors',
      description:
        'Draft the split sheet capturing every contributor (writers, producers, featured artists) and circulate for review. Signatures land in Week 6.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w7_decide_presave_campaign',
      title: 'Decide whether to do a pre-save campaign',
      description:
        'Make a call on whether this release will have a pre-save campaign. The decision drives downstream link setup, campaign go-live, ad spend, and release-week messaging.',
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
        'If shipping physical formats (vinyl, CD, cassette), kick off production now. Manufacturing alone is 8-12 weeks for vinyl in most regions, so this is the latest reasonable start.',
      role: 'manager',
      type: 'task',
      offset_days: -49,
      duration_days: 1,
      optional: true,
      tags: ['asset_production', 'physical'],
    },

    // -----------------------------------------------------------------------
    // Week 6 — Asset Production & Distributor Upload (Days 15-21) [offset -42]
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
      id: 'w6_content_shoot',
      title: 'Content shoot executed',
      description:
        'Run the content shoot: promo videos, photos, social clips. The footage feeds the entire rollout. Assigned to whoever on the team is running the shoot.',
      role: 'team',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      optional: false,
      tags: ['asset_production', 'marketing'],
    },
    {
      id: 'w6_finalize_split_sheet',
      title: 'Finalize split sheet signatures',
      description:
        'Collect signatures on the split sheet from every contributor. Must be done before distribution upload so the metadata reflects the true splits.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      optional: false,
      tags: ['planning'],
    },
    {
      id: 'w6_upload_to_distributor',
      title: 'Upload track and metadata to distributor',
      description:
        'Submit the locked master and full metadata (ISRC, songwriters, splits, language, explicit flag) to the distributor. Cover art uploads separately.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      depends_on: ['w8_lock_master'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w6_upload_cover_art',
      title: 'Upload cover art to distributor',
      description:
        'Upload the cover art file (correct dimensions, color profile) to the distributor alongside the track. Final approval lands in Week 5.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      depends_on: ['w6_cover_art_first_draft'],
      optional: false,
      tags: ['distribution', 'asset_production'],
    },
    {
      id: 'w6_confirm_release_date_at_distributor',
      title: 'Confirm release date locked at distributor',
      description:
        'Verify the release date is correctly set in the distributor dashboard so the track goes live on the planned day across all DSPs.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w6_setup_presave',
      title: 'Set up smart link',
      description:
        'Urganize makes the smart link from your rollout details, before the distributor delivers. Check it, then share it so fans can pre-save.',
      role: 'manager',
      type: 'task',
      offset_days: -42,
      duration_days: 1,
      optional: true,
      tags: ['distribution', 'marketing'],
    },
    {
      id: 'w6_curator_outreach',
      title: 'Begin curator/playlist outreach with private link',
      description:
        'Open curator/playlist outreach with the private link. Personalize each pitch with the track, cover, and release date. Ongoing across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -42,
      duration_days: 7,
      optional: false,
      tags: ['marketing', 'editorial'],
    },

    // -----------------------------------------------------------------------
    // Week 5 — Distribution Confirmation & Editorial Push (Days 22-28)
    // [offset -35; -33 for +2 day buffer task]
    // -----------------------------------------------------------------------
    {
      id: 'w5_confirm_distributor_accepted',
      title: 'Confirm distributor accepted submission with no metadata errors',
      description:
        '+2 day buffer after upload. Log in to the distributor dashboard and verify the submission is accepted, in review, and free of metadata errors. If rejected, resubmit immediately.',
      role: 'manager',
      type: 'task',
      offset_days: -33,
      duration_days: 1,
      depends_on: ['w6_upload_to_distributor'],
      optional: false,
      tags: ['distribution'],
    },
    {
      id: 'w5_cover_art_final_approved',
      title: 'Cover art final approved',
      description:
        'Sign off on the final cover art. Same file used everywhere: distributor, social, press, merch. Owner: manager with artist sign-off.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      optional: false,
      tags: ['asset_production'],
    },
    {
      id: 'w5_editorial_pitch',
      title: 'Editorial playlist pitch with final assets',
      description:
        'Pitch editorial playlists with final assets. 4+ weeks pre-release is the editorial window. Earlier and the pitch is incomplete, later and the editorial slot has closed.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w5_cover_art_final_approved'],
      optional: false,
      tags: ['editorial', 'marketing'],
    },
    {
      id: 'w5_presave_live',
      title: 'Pre-save campaign goes live',
      description:
        'Publish the pre-save link and start sharing it across artist channels. Requires the distributor to have accepted the submission so the link resolves correctly.',
      role: 'manager',
      type: 'task',
      offset_days: -35,
      duration_days: 1,
      depends_on: ['w6_setup_presave', 'w5_confirm_distributor_accepted'],
      optional: true,
      tags: ['marketing', 'distribution'],
    },
    {
      id: 'w5_trim_footage',
      title: 'Begin trimming content shoot footage into 3-5 promo edits',
      description:
        'Cut the content shoot footage into 3-5 promo edits ready for the marketing ramp (Weeks 4-1). Ongoing across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -35,
      duration_days: 7,
      optional: false,
      tags: ['asset_production', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 4 — Marketing Ramp (Days 29-35) [offset -28]
    // -----------------------------------------------------------------------
    {
      id: 'w4_announce_release_date',
      title: "Announce release date on artist's socials",
      description:
        "Public-facing release date announcement on the artist's socials. First explicit signal to the audience that the single is coming.",
      role: 'artist',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w4_teaser_rollout',
      title: 'Begin teaser content rollout (1 piece every 2-3 days)',
      description:
        'Open the teaser content rollout: short clips, behind-the-scenes, mood pieces. Cadence of one piece every 2-3 days across the week.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -28,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
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
    {
      id: 'w4_followup_curator_outreach',
      title: 'Follow up on curator outreach',
      description:
        'Nudge curators and contacts who did not respond to the Week 6 outreach. Send the final cover art and any new traction (early teaser engagement, pre-save numbers).',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      optional: true,
      tags: ['marketing', 'editorial'],
    },
    {
      // The one Spotify editorial pitch. Spotify only accepts a pitch once the
      // distributor has delivered the release, and wants it at least 7 days
      // before release day, so it waits on the upload and sits at -28.
      id: 'editorial_pitch',
      title: 'Pitch to Spotify editorial',
      description:
        'Spotify needs this at least 7 days before release day. Earlier gives you a better shot.',
      role: 'manager',
      type: 'task',
      offset_days: -28,
      duration_days: 1,
      depends_on: ['w6_upload_to_distributor'],
      optional: false,
      tags: ['editorial', 'distribution'],
    },

    // -----------------------------------------------------------------------
    // Week 3 — Pre-Release Push (Days 36-42) [offset -21]
    // -----------------------------------------------------------------------
    {
      id: 'w3_increase_teaser_frequency',
      title: 'Increase teaser content frequency',
      description:
        'Step up the teaser cadence: daily posts, more channels, more variation. The release is now visible on the horizon and momentum should be building.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 7,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w3_schedule_release_day_posts',
      title: 'Schedule release-day social posts',
      description:
        'Queue release-day posts in the scheduler: drop announcement, thank-you, distributor go-live confirmation. Release day should not require live composition.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w3_confirm_release_day_events',
      title: 'Confirm any release-day events',
      description:
        'Confirm any release-day events (listening session, IG live, etc.): date, time, attendees, equipment, link. Lock the logistics so release day runs cleanly.',
      role: 'manager',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'event'],
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
    {
      id: 'w3_confirm_playlist_placements',
      title: 'Confirm playlist placements that came back positive',
      description:
        'Lock in the placements that responded positively to curator outreach. Confirm timing, link to use, and any features (cover, blurb) the curator wants.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -21,
      duration_days: 1,
      optional: false,
      tags: ['editorial', 'marketing'],
    },

    // -----------------------------------------------------------------------
    // Week 2 — Final Prep (Days 43-49) [offset -14]
    // -----------------------------------------------------------------------
    {
      id: 'w2_listening_party',
      title: 'Listening party or IG live planned (if doing one)',
      description:
        'Hold the listening party, IG Live, or fan moment. Dated point on the release timeline rather than ongoing work.',
      role: 'manager',
      type: 'event_milestone',
      offset_days: -14,
      duration_days: 1,
      optional: true,
      tags: ['event', 'marketing'],
    },
    {
      id: 'w2_snippet_release',
      title: 'Snippet release on TikTok/Reels',
      description:
        'Drop the official snippet on TikTok/Reels. Short, hook-forward, designed to seed user-generated content before release day.',
      role: 'artist',
      type: 'task',
      offset_days: -14,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w2_prepare_release_day_posts',
      title: 'Prepare release-day stories and posts (queued in scheduler)',
      description:
        'Build out the release-day stories and feed posts and queue them in the scheduler. Includes drop announcement, distributor confirmation, thank-you, and any platform-specific variants.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: -14,
      duration_days: 1,
      optional: false,
      tags: ['marketing'],
    },
    {
      id: 'w2_setup_artist_analytics',
      title: 'Set up Spotify for Artists / Apple Music for Artists access',
      description:
        'Make sure analytics access (Spotify for Artists, Apple Music for Artists) is provisioned for the right people before release day. Catching missing access on day 0 is too late.',
      role: 'manager',
      type: 'task',
      offset_days: -14,
      duration_days: 1,
      optional: false,
      tags: ['analytics', 'distribution'],
    },

    // -----------------------------------------------------------------------
    // Week 1 — Release Week (Days 50-56)
    // [offsets -7, -3, -1, 0]
    // -----------------------------------------------------------------------
    {
      id: 'w1_countdown_content',
      title: '7 days out: countdown content begins',
      description:
        'Start the explicit countdown: "7 days", "6 days", etc. Pin a release post. Switch artist bios and profile art to release-week assets.',
      role: 'artist',
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
      tags: ['marketing', 'paid'],
    },
    {
      id: 'w1_presave_reminder',
      title: '1 day out: pre-save reminder to mailing list / fans',
      description:
        'Send the final pre-save reminder to the mailing list and top fans. Last call before release day: story posts, DMs, mailing list blast.',
      role: 'manager',
      type: 'task',
      offset_days: -1,
      duration_days: 1,
      optional: true,
      tags: ['marketing'],
    },
    {
      id: 'release_day_announcement',
      title: 'Release day: post drop announcement across all platforms',
      description:
        'Post the drop announcement across every artist platform: IG, TikTok, X, YouTube, mailing list. The single is live.',
      role: 'artist',
      type: 'event_milestone',
      offset_days: 0,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },
    {
      id: 'release_day_monitor_distributor',
      title: 'Release day: monitor distributor for go-live across all DSPs',
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
      title: 'Release day: thank-you content, share early stats with team',
      description:
        'Post thank-you content to audience, team, collaborators, and curators. Share early stats with the team internally. Owner: manager with artist co-posting.',
      role: 'manager',
      type: 'event_milestone',
      offset_days: 0,
      duration_days: 1,
      optional: false,
      tags: ['release_day', 'marketing', 'event'],
    },

    // -----------------------------------------------------------------------
    // Week 0 — Release Week Wrap-Up (Days 57-63) [offset 1]
    // -----------------------------------------------------------------------
    {
      id: 'w0_compile_first_week_stats',
      title: 'Compile first-week stats: streams, saves, playlist adds, top markets',
      description:
        'Pull first-week numbers from Spotify for Artists, Apple Music for Artists, and the distributor: streams, saves, playlist adds, top markets. Establish the baseline.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['analytics', 'followup'],
    },
    {
      id: 'w0_debrief_with_team',
      title: "Debrief with team: what worked, what didn't",
      description:
        "Hold a short debrief covering what worked, what didn't, and what to change for the next rollout. Capture decisions while context is fresh.",
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'followup'],
    },
    {
      id: 'w0_identify_top_content',
      title: 'Identify top-performing content from the rollout',
      description:
        'Identify the best-performing rollout content (teasers, snippets, ads). Drives the Week +1/+2/+3 follow-up content choices and informs the next single.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['analytics', 'followup'],
    },
    {
      id: 'w0_investigate_underperforming_dsps',
      title: 'Investigate any DSPs where the release underperformed expectations',
      description:
        'Identify any DSPs where the release underperformed expectations and investigate: late go-live, missing metadata, missed editorial, weak playlist coverage.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['analytics', 'distribution', 'followup'],
    },
    {
      id: 'w0_thankyou_posts',
      title: 'Thank-you posts to playlist curators, press, and collaborators',
      description:
        'Public thank-you posts to playlist curators, press, and collaborators who supported the release. Owner: manager with artist co-posting.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['marketing', 'followup'],
    },
    {
      id: 'w0_update_release_tracker',
      title: 'Update master release tracker',
      description:
        'Update the master release tracker with final rollout details: dates, partners, numbers, learnings. The next rollout draws from this record.',
      role: 'manager',
      type: 'task',
      offset_days: 1,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'followup'],
    },

    // -----------------------------------------------------------------------
    // Week +1 — First Follow-Up Push (Days 64-70) [offset 8]
    // -----------------------------------------------------------------------
    {
      id: 'post_w1_followup_content',
      title: 'Post 2-3 pieces of follow-up content',
      description:
        'Post 2-3 pieces of follow-up content: lyric video, BTS, alternate edit, fan reaction reposts. Cadence is per day or per week based on artist scale.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 7,
      optional: false,
      tags: ['marketing', 'followup'],
    },
    {
      id: 'post_w1_secondary_editorial_pitch',
      title: 'Pitch to secondary editorial playlists with first-week stats',
      description:
        'Pitch secondary editorial playlists using first-week stats as evidence. Editorial that did not pick up pre-release may pick up post-release with traction data.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 1,
      optional: false,
      tags: ['editorial', 'marketing', 'followup'],
    },
    {
      id: 'post_w1_engage_with_fans',
      title: 'Engage with fan posts and tags from release week',
      description:
        'Engage with fan posts and tags from release week: repost, comment, share. Rewards early supporters and keeps the conversation alive.',
      role: 'artist',
      type: 'task',
      offset_days: 8,
      duration_days: 1,
      optional: false,
      tags: ['marketing', 'followup'],
    },
    {
      id: 'post_w1_amplify_press',
      title: 'Check for blog/press pickup and amplify any that landed',
      description:
        'Sweep for blog/press pickup from the rollout and amplify any that landed (repost, link, thank). Press signal compounds when the artist amplifies it.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 8,
      duration_days: 1,
      optional: false,
      tags: ['marketing', 'followup'],
    },

    // -----------------------------------------------------------------------
    // Week +2 — Sustained Momentum (Days 71-77) [offset 15]
    // -----------------------------------------------------------------------
    {
      id: 'post_w2_followup_content',
      title: 'Post 2-3 pieces of follow-up content',
      description:
        'Post 2-3 pieces of follow-up content: live performance, acoustic version, story behind the song. Cadence per artist scale.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 7,
      optional: false,
      tags: ['marketing', 'followup'],
    },
    {
      id: 'post_w2_genre_playlists_pitch',
      title: 'Pitch to mood-based or genre-based playlists',
      description:
        'Pitch mood-based or genre-based playlists. Less competitive than editorial and the right home for tracks the algorithm has started warming on.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      optional: false,
      tags: ['editorial', 'marketing', 'followup'],
    },
    {
      id: 'post_w2_review_analytics',
      title: 'Review Spotify for Artists / Apple Music for Artists analytics',
      description:
        'Review Spotify for Artists / Apple Music for Artists analytics: where listeners are coming from, who they are. Profiles the audience for the next rollout.',
      role: 'manager',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      optional: false,
      tags: ['analytics', 'followup'],
    },
    {
      id: 'post_w2_review_ads',
      title: 'Review ads performance',
      description:
        'Review ads performance: spend efficiency, top-performing creative, audience that converted, cost per save/stream. Document learnings for the next release.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      optional: true,
      tags: ['analytics', 'marketing', 'paid', 'followup'],
    },
    {
      id: 'post_w2_identify_market',
      title: 'Identify the strongest market and consider geo-targeted content',
      description:
        'Identify the strongest market from analytics and consider geo-targeted content for it. Locating the audience makes the next single sharper.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 15,
      duration_days: 1,
      optional: false,
      tags: ['analytics', 'marketing', 'followup'],
    },

    // -----------------------------------------------------------------------
    // Week +3 — Long Tail Setup (Days 78-84) [offset 22]
    // -----------------------------------------------------------------------
    {
      id: 'post_w3_followup_content',
      title: 'Post 2-3 pieces of follow-up content',
      description:
        'Post 2-3 pieces of follow-up content: milestone celebrations, listener stats share, artist commentary, remix tease if applicable. Cadence per artist scale.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 22,
      duration_days: 7,
      optional: false,
      tags: ['marketing', 'followup'],
    },
    {
      id: 'post_w3_decide_next_release',
      title: 'Decide on the next release cycle',
      description:
        'Decide on the next release cycle: when is the next single, what builds on this momentum. Locks the cadence between releases.',
      role: 'manager',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'followup'],
    },
    {
      id: 'post_w3_document_lessons',
      title: 'Document lessons learned in master release tracker',
      description:
        'Document the lessons learned in the master release tracker for the next rollout. Concrete enough that the next single avoids the same mistakes.',
      role: 'manager',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      optional: false,
      tags: ['planning', 'followup'],
    },
    {
      id: 'post_w3_yearend_submission',
      title: 'Submit to year-end / quarterly editorial considerations if timing is relevant',
      description:
        'If timing aligns with a year-end or quarterly editorial cycle, submit the track for those considerations. Otherwise skip and revisit when the next cycle opens.',
      role: 'marketing_lead',
      type: 'task',
      offset_days: 22,
      duration_days: 1,
      optional: true,
      tags: ['editorial', 'marketing', 'followup'],
    },
  ],
};

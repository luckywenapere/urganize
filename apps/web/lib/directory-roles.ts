/**
 * The directory's role vocabulary, and the allowlist that decides what the
 * product is willing to say a person has delivered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS AN ID ALLOWLIST AND NOT A READ OF `metadata.template.role`
 *
 * Tasks already carry a role, but the vocabulary is six ARCHETYPES
 * (lib/release-templates/types.ts: artist, manager, marketing_lead, designer,
 * distributor_contact, team) and its distribution across single_v0.3's 62
 * tasks is manager 34, marketing_lead 22, artist 6, team 1, designer 1,
 * distributor_contact 0.
 *
 * So an archetype-driven directory would say almost everyone is a manager, and
 * eleven of the sixteen roles below could never hold a single record. The task
 * IDS carry the signal the archetypes lost, which is why the map is keyed on
 * them. This follows lib/cover-art-tasks.ts exactly, and for the reason stated
 * there: an allowlist asserted against the live playbooks turns a renamed step
 * into a failing test rather than a feature that quietly stops working.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE MAP IS SMALL, AND WHY THAT IS THE HONEST ANSWER
 *
 * The playbooks are written from the MANAGER'S point of view. Most steps are
 * something the manager does, including the steps ABOUT other people's work:
 * "Brief designer on cover art" is the manager writing a brief, not a designer
 * delivering anything. Only a handful of steps represent a THIRD PARTY handing
 * work over, and only those can honestly credit the person they are assigned
 * to.
 *
 * Five roles reach that bar today. The other eleven stay CLAIMABLE and
 * UNVERIFIABLE until a playbook names that work, and the UI has to say so
 * plainly rather than hide the gap. Empty is better than fake.
 *
 * Deliberately absent, each for its own reason:
 *
 *   - Manager. The release owner does this work and the owner is excluded by
 *     design (see lib/delivery-records.ts). A co-manager is real, but no step
 *     says "this person managed the release" as distinct from doing one chore.
 *   - Photographer. `*_content_shoot` is "content shoot executed", which is a
 *     photographer or a videographer depending on the release, and nothing in
 *     the row says which. Crediting both from one shoot would inflate two
 *     records off one piece of work.
 *   - Producer, Mix engineer, Songwriter, A&R, Booking agent, Tour manager,
 *     Playlist curator, Video director, Distributor. No playbook step
 *     represents them delivering. The curator steps are about pitching TO a
 *     curator, which is the other side of that relationship.
 */

export const DIRECTORY_ROLES = [
  'manager',
  'a_and_r',
  'producer',
  'mix_engineer',
  'master_engineer',
  'songwriter',
  'videographer',
  'video_director',
  'photographer',
  'graphic_designer',
  'pr',
  'digital_marketer',
  'playlist_curator',
  'booking_agent',
  'tour_manager',
  'distributor',
] as const;

export type DirectoryRole = (typeof DIRECTORY_ROLES)[number];

/** Product copy. Plain job names, the way somebody would describe themselves. */
export const DIRECTORY_ROLE_LABELS: Record<DirectoryRole, string> = {
  manager: 'Manager',
  a_and_r: 'A&R',
  producer: 'Producer',
  mix_engineer: 'Mix engineer',
  master_engineer: 'Master engineer',
  songwriter: 'Songwriter',
  videographer: 'Videographer',
  video_director: 'Video director',
  photographer: 'Photographer',
  graphic_designer: 'Graphic designer',
  pr: 'PR',
  digital_marketer: 'Digital marketer',
  playlist_curator: 'Playlist curator',
  booking_agent: 'Booking agent',
  tour_manager: 'Tour manager',
  distributor: 'Distributor',
};

/**
 * Playbook step -> the role of whoever it is assigned to.
 *
 * Every entry is a step where the work ARRIVES rather than one where it is
 * commissioned, planned or chased. All three playbooks are covered for each
 * role, so an EP team and a single team can earn the same records.
 */
export const DELIVERY_TASK_ROLE: Readonly<Record<string, DirectoryRole>> = {
  // The artwork was delivered or signed off. The designer made it.
  w6_cover_art_first_draft: 'graphic_designer',
  w5_cover_art_final_approved: 'graphic_designer',
  w10_ep_art_draft: 'graphic_designer',
  w9_ep_art_approved: 'graphic_designer',
  w11_single_art_approved: 'graphic_designer',
  w14_album_art_draft: 'graphic_designer',
  w13_album_art_approved: 'graphic_designer',
  w14_single_1_art_approved: 'graphic_designer',
  w9_single_2_art_approved: 'graphic_designer',

  // The master is final. Mastering is the deliverable.
  w8_lock_master: 'master_engineer',
  w13_lock_all_masters: 'master_engineer',
  w17_lock_all_masters: 'master_engineer',

  // Cutting shoot footage into promo edits is unambiguously video work, which
  // is why this is here and the shoot itself is not.
  w5_trim_footage: 'videographer',
  w10_trim_footage: 'videographer',
  w14_trim_footage: 'videographer',

  // Press outreach, as opposed to briefing a contact.
  w3_send_press_release: 'pr',
  w4_send_press_release: 'pr',
  post_w1_amplify_press: 'pr',
  w4_pitch_long_form_press: 'pr',
  post_w1_press_pickup: 'pr',

  // Paid promotion.
  w1_final_push_ads: 'digital_marketer',
  post_w2_review_ads: 'digital_marketer',
  w8_single_ads: 'digital_marketer',
};

/**
 * The roles the map can actually reach, derived rather than restated.
 *
 * Two hand-written lists would drift, so adding a task id above is the only
 * way to make a role verifiable.
 */
export const VERIFIABLE_ROLES: ReadonlySet<DirectoryRole> = new Set(
  Object.values(DELIVERY_TASK_ROLE)
);

/** Null for a manager-added activity, an unmapped step, or a missing id. */
export function roleForTemplateTask(templateTaskId: string | null | undefined): DirectoryRole | null {
  if (!templateTaskId) return null;
  return DELIVERY_TASK_ROLE[templateTaskId] ?? null;
}

/**
 * Playbook step -> the role you need somebody FOR.
 *
 * A different question from DELIVERY_TASK_ROLE above, and the difference is the
 * whole reason there are two maps. That one answers "who did this?", so it
 * covers only steps where work ARRIVES. This one answers "who do I need?", and
 * the COMMISSIONING steps are the better answer to it because they come first:
 *
 *   w7_brief_designer          "Brief designer on cover art"       week 7
 *   w6_cover_art_first_draft   "Cover art first draft delivered"   week 6
 *
 * Telling a manager they need a designer at the briefing step is a week of
 * warning. Telling them at the delivery step is telling them late.
 *
 * Roles with no commissioning step in any playbook — master engineer,
 * videographer, digital marketer — are not listed here and fall through to the
 * delivery map, which is the earliest signal they have.
 *
 * `*_plan_content_shoot` stays unmapped for the same reason the shoot itself
 * is: it is a photographer or a videographer depending on the release, and a
 * link cannot pre-filter the directory to a role nothing in the row names.
 */
export const HIRING_TASK_ROLE: Readonly<Record<string, DirectoryRole>> = {
  w7_brief_designer: 'graphic_designer',
  w12_brief_single_art: 'graphic_designer',
  w11_brief_designer_ep_art: 'graphic_designer',
  w16_brief_designer_album_art: 'graphic_designer',
  w15_brief_single_1_art: 'graphic_designer',
  w10_brief_single_2_art: 'graphic_designer',

  w4_brief_pr_contacts: 'pr',
  w9_brief_pr: 'pr',
  w11_brief_pr: 'pr',
};

/**
 * The role a step means you need somebody for, hiring signal first.
 *
 * THE TWO MAPS MUST STAY DISJOINT, and a test enforces it. While they are, this
 * lookup order is unobservable — which is the safe state, and worth saying
 * plainly rather than claiming an order rule the code does not actually
 * depend on. The moment one id appeared in both, the order WOULD start
 * deciding whether a designer gap surfaces at the briefing step or a week
 * later at delivery, and nothing on screen would look wrong.
 */
export function roleNeededForTask(templateTaskId: string | null | undefined): DirectoryRole | null {
  if (!templateTaskId) return null;
  return HIRING_TASK_ROLE[templateTaskId] ?? DELIVERY_TASK_ROLE[templateTaskId] ?? null;
}

export type TimelineStage =
  | '12_weeks_before'
  | '8_weeks_before'
  | '6_weeks_before'
  | '4_weeks_before'
  | '2_weeks_before'
  | 'release_week'
  | 'release_day'
  | 'post_release';

export type ReleaseChecklistTemplateItem = {
  title: string;
  description: string;
  timelineStage: TimelineStage;
};

export type GeneratedReleaseChecklistItem = ReleaseChecklistTemplateItem & {
  recommendedTiming: string;
  dueDate: string;
  orderIndex: number;
  phase: 'pre-production' | 'production' | 'promotion' | 'distribution';
};

export const TIMELINE_STAGE_ORDER: TimelineStage[] = [
  '12_weeks_before',
  '8_weeks_before',
  '6_weeks_before',
  '4_weeks_before',
  '2_weeks_before',
  'release_week',
  'release_day',
  'post_release',
];

export const TIMELINE_STAGE_LABELS: Record<TimelineStage, string> = {
  '12_weeks_before': '12 Weeks Before Release',
  '8_weeks_before': '8 Weeks Before Release',
  '6_weeks_before': '6 Weeks Before Release',
  '4_weeks_before': '4 Weeks Before Release',
  '2_weeks_before': '2 Weeks Before Release',
  release_week: 'Release Week',
  release_day: 'Release Day',
  post_release: 'Post Release',
};

const TIMELINE_STAGE_OFFSETS: Record<TimelineStage, number> = {
  '12_weeks_before': -84,
  '8_weeks_before': -56,
  '6_weeks_before': -42,
  '4_weeks_before': -28,
  '2_weeks_before': -14,
  release_week: -7,
  release_day: 0,
  post_release: 3,
};

const CHECKLIST_TEMPLATE: ReleaseChecklistTemplateItem[] = [
  {
    title: 'Define Release Strategy',
    description: 'Plan the release goals, audience, and rollout strategy before the campaign begins.',
    timelineStage: '12_weeks_before',
  },
  {
    title: 'Choose Release Date',
    description: 'Confirm the final release date and align the team around the schedule.',
    timelineStage: '12_weeks_before',
  },
  {
    title: 'Finalize Song Master',
    description: 'Approve the final master and make sure the release audio is ready for delivery.',
    timelineStage: '12_weeks_before',
  },
  {
    title: 'Register ISRC Codes',
    description: 'Assign and verify the ISRC codes needed for the release assets.',
    timelineStage: '12_weeks_before',
  },
  {
    title: 'Confirm Song Splits and Ownership',
    description: 'Document writer, producer, and ownership splits clearly before the release is submitted anywhere.',
    timelineStage: '12_weeks_before',
  },
  {
    title: 'Set Up Publishing Administration',
    description: 'Confirm who will administer publishing and make sure all composition rights data is ready for registration.',
    timelineStage: '12_weeks_before',
  },
  {
    title: 'Register With PRO or CMO',
    description: 'Register the composition with the relevant performing rights or collecting management organization.',
    timelineStage: '12_weeks_before',
  },
  {
    title: 'Confirm Distribution Platform',
    description: 'Choose the distribution partner and verify submission requirements.',
    timelineStage: '12_weeks_before',
  },
  {
    title: 'Upload Music to Distributor',
    description: 'Deliver the release files to the selected distributor with enough lead time.',
    timelineStage: '8_weeks_before',
  },
  {
    title: 'Prepare Cover Artwork',
    description: 'Finalize release artwork in the correct format for distribution and promotion.',
    timelineStage: '8_weeks_before',
  },
  {
    title: 'Write Song Metadata',
    description: 'Complete all writer, producer, and credit metadata for accurate release setup.',
    timelineStage: '8_weeks_before',
  },
  {
    title: 'Register UPC and Release Credits',
    description: 'Verify the UPC and confirm that release-level credits, contributors, and identifiers are properly recorded.',
    timelineStage: '8_weeks_before',
  },
  {
    title: 'Register Neighboring Rights',
    description: 'Submit performer and master-rights details to the appropriate neighboring rights collection body.',
    timelineStage: '8_weeks_before',
  },
  {
    title: 'Create Marketing Plan',
    description: 'Outline the campaign channels, rollout beats, and content priorities.',
    timelineStage: '6_weeks_before',
  },
  {
    title: 'Plan Social Media Content',
    description: 'Map out the content calendar for teasers, announcements, and follow-up posts.',
    timelineStage: '6_weeks_before',
  },
  {
    title: 'Film Promotional Content',
    description: 'Capture teaser videos, studio clips, and other short-form promo assets.',
    timelineStage: '6_weeks_before',
  },
  {
    title: 'Submit to Spotify Playlist Pitching',
    description: 'Pitch the release early enough to meet Spotify editorial timing requirements.',
    timelineStage: '4_weeks_before',
  },
  {
    title: 'Launch Pre-Save Campaign',
    description: 'Set up and promote a pre-save link to build early intent before release.',
    timelineStage: '4_weeks_before',
  },
  {
    title: 'Prepare Visual Assets',
    description: 'Package final social banners, alternate covers, and promo visuals for rollout use.',
    timelineStage: '4_weeks_before',
  },
  {
    title: 'Begin Social Media Rollout',
    description: 'Start posting campaign content consistently across the key audience platforms.',
    timelineStage: '2_weeks_before',
  },
  {
    title: 'Send Press Outreach',
    description: 'Share the release with blogs, journalists, and curators who should know about it.',
    timelineStage: '2_weeks_before',
  },
  {
    title: 'Increase Social Content',
    description: 'Increase posting frequency and push the strongest content into release week.',
    timelineStage: 'release_week',
  },
  {
    title: 'Post Teasers',
    description: 'Post final teaser content that builds anticipation right before release day.',
    timelineStage: 'release_week',
  },
  {
    title: 'Engage Fans',
    description: 'Reply to comments, repost reactions, and keep audience momentum high.',
    timelineStage: 'release_week',
  },
  {
    title: 'Announce Release',
    description: 'Publish the official release announcement across all active channels.',
    timelineStage: 'release_day',
  },
  {
    title: 'Update Profile Links',
    description: 'Replace old links with live release links on bios, link pages, and profiles.',
    timelineStage: 'release_day',
  },
  {
    title: 'Engage Audience on Release Day',
    description: 'Actively respond to listeners and amplify the release conversation on day one.',
    timelineStage: 'release_day',
  },
  {
    title: 'Monitor Streaming Performance',
    description: 'Track initial streaming performance and spot which channels are driving attention.',
    timelineStage: 'post_release',
  },
  {
    title: 'Verify Rights Registrations',
    description: 'Confirm that publishing, neighboring rights, and metadata registrations were accepted without errors.',
    timelineStage: 'post_release',
  },
  {
    title: 'Continue Promotion',
    description: 'Keep promotion active after release day with follow-up content and reminders.',
    timelineStage: 'post_release',
  },
  {
    title: 'Submit to Additional Playlists',
    description: 'Follow up with independent playlist curators and additional playlist opportunities.',
    timelineStage: 'post_release',
  },
  {
    title: 'Collect Fan Content',
    description: 'Save and repost user-generated content, reactions, and fan shout-outs.',
    timelineStage: 'post_release',
  },
];

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const formatDateInput = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatTimingLabel = (stage: TimelineStage): string => {
  if (stage === 'release_week') return 'Release week';
  if (stage === 'release_day') return 'Release day';
  if (stage === 'post_release') return '3 days after release';
  return TIMELINE_STAGE_LABELS[stage].replace('Release', '').trim().toLowerCase();
};

const mapStageToPhase = (stage: TimelineStage): GeneratedReleaseChecklistItem['phase'] => {
  if (stage === '12_weeks_before' || stage === '8_weeks_before') return 'pre-production';
  if (stage === '6_weeks_before' || stage === '4_weeks_before') return 'production';
  if (stage === '2_weeks_before' || stage === 'release_week') return 'promotion';
  return 'distribution';
};

export const buildReleaseChecklist = (releaseDateInput: string): GeneratedReleaseChecklistItem[] => {
  const releaseDate = new Date(releaseDateInput);
  return CHECKLIST_TEMPLATE.map((item, index) => {
    const dueDate = addDays(releaseDate, TIMELINE_STAGE_OFFSETS[item.timelineStage]);
    return {
      ...item,
      recommendedTiming: formatTimingLabel(item.timelineStage),
      dueDate: dueDate.toISOString(),
      orderIndex: index,
      phase: mapStageToPhase(item.timelineStage),
    };
  });
};

export const groupChecklistByStage = <T extends { timelineStage: TimelineStage }>(items: T[]) =>
  TIMELINE_STAGE_ORDER.map((stage) => ({
    stage,
    label: TIMELINE_STAGE_LABELS[stage],
    items: items.filter((item) => item.timelineStage === stage),
  })).filter((group) => group.items.length > 0);

export const getChecklistProgress = (total: number, completed: number): number => {
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
};

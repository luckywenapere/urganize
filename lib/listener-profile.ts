export type ListenerProfileSectionId =
  | 'music-context'
  | 'artist-identity'
  | 'listener-demographics'
  | 'lifestyle-signals'
  | 'online-behavior'
  | 'psychology'
  | 'campaign-intelligence';

export type ListenerFieldDefinition = {
  key: string;
  sectionId: ListenerProfileSectionId;
  sectionTitle: string;
  label: string;
  helper: string;
  placeholder: string;
};

export const LISTENER_PROFILE_FIELDS = [
  {
    key: 'artist_name',
    sectionId: 'music-context',
    sectionTitle: 'Music Context',
    label: 'Artist Name',
    helper: 'How should the artist name appear in this listener profile?',
    placeholder: 'e.g. Temi Nova',
  },
  {
    key: 'primary_genre',
    sectionId: 'music-context',
    sectionTitle: 'Music Context',
    label: 'Primary Genre',
    helper: 'What core genre best describes your music?',
    placeholder: 'e.g. Afrobeats',
  },
  {
    key: 'subgenre_influences',
    sectionId: 'music-context',
    sectionTitle: 'Music Context',
    label: 'Subgenre or Influences',
    helper: 'Add subgenres, references, or musical influences.',
    placeholder: 'e.g. Alt-pop, amapiano, R&B fusion',
  },
  {
    key: 'music_mood',
    sectionId: 'music-context',
    sectionTitle: 'Music Context',
    label: 'Mood of Music',
    helper: 'What mood is most common in your songs?',
    placeholder: 'e.g. Emotional but confident',
  },
  {
    key: 'lyric_themes',
    sectionId: 'music-context',
    sectionTitle: 'Music Context',
    label: 'Themes in Lyrics',
    helper: 'What recurring stories or ideas show up in your lyrics?',
    placeholder: 'e.g. Love, ambition, city life',
  },
  {
    key: 'music_languages',
    sectionId: 'music-context',
    sectionTitle: 'Music Context',
    label: 'Languages Used in Music',
    helper: 'Which languages do you use in songs?',
    placeholder: 'e.g. English, Yoruba, Pidgin',
  },
  {
    key: 'similar_artists',
    sectionId: 'music-context',
    sectionTitle: 'Music Context',
    label: 'Similar Artists',
    helper: 'Who do listeners compare your sound to?',
    placeholder: 'e.g. Ayra Starr, Rema, Tems',
  },
  {
    key: 'artist_aesthetic',
    sectionId: 'artist-identity',
    sectionTitle: 'Artist Identity',
    label: 'Artist Aesthetic or Visual Style',
    helper: 'Describe the visual world around the artist brand.',
    placeholder: 'e.g. Street luxury with cinematic neon tones',
  },
  {
    key: 'fashion_influence',
    sectionId: 'artist-identity',
    sectionTitle: 'Artist Identity',
    label: 'Fashion Influence',
    helper: 'What fashion references match the artist?',
    placeholder: 'e.g. Y2K streetwear, tailored Afro-futurism',
  },
  {
    key: 'brand_message',
    sectionId: 'artist-identity',
    sectionTitle: 'Artist Identity',
    label: 'Core Brand Message',
    helper: 'What does the artist stand for?',
    placeholder: 'e.g. Rising above pressure without losing softness',
  },
  {
    key: 'artist_personality',
    sectionId: 'artist-identity',
    sectionTitle: 'Artist Identity',
    label: 'Personality of the Artist',
    helper: 'How should fans describe the artist personality?',
    placeholder: 'e.g. Bold, witty, emotionally sharp',
  },
  {
    key: 'artist_values',
    sectionId: 'artist-identity',
    sectionTitle: 'Artist Identity',
    label: 'Values or Beliefs in Music',
    helper: 'Which values are reflected through the music?',
    placeholder: 'e.g. Self-respect, authenticity, community',
  },
  {
    key: 'listener_age_range',
    sectionId: 'listener-demographics',
    sectionTitle: 'Listener Demographics',
    label: 'Likely Age Range',
    helper: 'What age bracket is most likely to connect?',
    placeholder: 'e.g. 18-27',
  },
  {
    key: 'listener_gender_tendency',
    sectionId: 'listener-demographics',
    sectionTitle: 'Listener Demographics',
    label: 'Gender Tendency (Optional)',
    helper: 'If relevant, note any skew in gender mix.',
    placeholder: 'e.g. Slightly female-leaning',
  },
  {
    key: 'listener_countries',
    sectionId: 'listener-demographics',
    sectionTitle: 'Listener Demographics',
    label: 'Likely Countries',
    helper: 'Where is demand most likely to come from?',
    placeholder: 'e.g. Nigeria, Ghana, UK',
  },
  {
    key: 'listener_cities_regions',
    sectionId: 'listener-demographics',
    sectionTitle: 'Listener Demographics',
    label: 'Cities or Regions (Optional)',
    helper: 'Which cities or subregions matter most?',
    placeholder: 'e.g. Lagos, Accra, London',
  },
  {
    key: 'listener_languages',
    sectionId: 'listener-demographics',
    sectionTitle: 'Listener Demographics',
    label: 'Languages They Speak',
    helper: 'What languages should campaigns use?',
    placeholder: 'e.g. English, Pidgin',
  },
  {
    key: 'listener_lifestyle',
    sectionId: 'lifestyle-signals',
    sectionTitle: 'Lifestyle Signals',
    label: 'Lifestyle Type',
    helper: 'What lifestyle pattern matches your listeners?',
    placeholder: 'e.g. Student, nightlife, creative professional',
  },
  {
    key: 'listener_interests',
    sectionId: 'lifestyle-signals',
    sectionTitle: 'Lifestyle Signals',
    label: 'Interests Outside Music',
    helper: 'What else do they care about?',
    placeholder: 'e.g. Fashion, gaming, fitness',
  },
  {
    key: 'listener_communities',
    sectionId: 'lifestyle-signals',
    sectionTitle: 'Lifestyle Signals',
    label: 'Communities They Belong To',
    helper: 'What subcultures or communities are they part of?',
    placeholder: 'e.g. Dancers, skaters, indie creators',
  },
  {
    key: 'listener_platforms',
    sectionId: 'online-behavior',
    sectionTitle: 'Online Behavior',
    label: 'Platforms They Use Most',
    helper: 'Which platforms should be prioritized?',
    placeholder: 'e.g. TikTok, Instagram, YouTube',
  },
  {
    key: 'listener_activity_time',
    sectionId: 'online-behavior',
    sectionTitle: 'Online Behavior',
    label: 'Most Active Time Online',
    helper: 'When are they usually active?',
    placeholder: 'e.g. Weeknights 7pm-11pm WAT',
  },
  {
    key: 'music_discovery',
    sectionId: 'online-behavior',
    sectionTitle: 'Online Behavior',
    label: 'How They Discover Music',
    helper: 'What discovery channels drive first listen?',
    placeholder: 'e.g. TikTok snippets, playlist placements',
  },
  {
    key: 'listener_emotions',
    sectionId: 'psychology',
    sectionTitle: 'Psychology',
    label: 'Emotions Your Music Triggers',
    helper: 'What emotional response does the music create?',
    placeholder: 'e.g. Nostalgia, confidence, release',
  },
  {
    key: 'listener_problems',
    sectionId: 'psychology',
    sectionTitle: 'Psychology',
    label: 'Problems They Relate To',
    helper: 'What personal or social tensions resonate with them?',
    placeholder: 'e.g. Pressure to succeed, heartbreak, identity',
  },
  {
    key: 'listener_aspirations',
    sectionId: 'psychology',
    sectionTitle: 'Psychology',
    label: 'What They Aspire to Become',
    helper: 'What future version of themselves are they chasing?',
    placeholder: 'e.g. Financially free, stylish, respected',
  },
  {
    key: 'listener_share_triggers',
    sectionId: 'psychology',
    sectionTitle: 'Psychology',
    label: 'What Makes Them Share Music',
    helper: 'What prompts reposts and social sharing?',
    placeholder: 'e.g. Relatable quote lines, dance hooks',
  },
  {
    key: 'listener_loyalty_triggers',
    sectionId: 'psychology',
    sectionTitle: 'Psychology',
    label: 'What Makes Them Loyal Fans',
    helper: 'What earns repeat listening and long-term support?',
    placeholder: 'e.g. Honest storytelling and consistent drops',
  },
  {
    key: 'campaign_visual_triggers',
    sectionId: 'campaign-intelligence',
    sectionTitle: 'Campaign Intelligence',
    label: 'Visuals That Attract Them',
    helper: 'What visual language should campaigns use?',
    placeholder: 'e.g. Grainy flash photos, high-contrast street scenes',
  },
  {
    key: 'campaign_message_style',
    sectionId: 'campaign-intelligence',
    sectionTitle: 'Campaign Intelligence',
    label: 'Messaging That Resonates',
    helper: 'What message tone works best for this audience?',
    placeholder: 'e.g. Direct, witty, emotionally honest',
  },
  {
    key: 'campaign_content_hooks',
    sectionId: 'campaign-intelligence',
    sectionTitle: 'Campaign Intelligence',
    label: 'Content Hooks That Capture Them',
    helper: 'Which recurring hook formats should marketing test?',
    placeholder: 'e.g. 9-second chorus reveal, lyric POV captions',
  },
] as const satisfies readonly ListenerFieldDefinition[];

export type ListenerProfileInputKey = (typeof LISTENER_PROFILE_FIELDS)[number]['key'];

export type ListenerProfileInputs = Record<ListenerProfileInputKey, string | null>;

export type ListenerProfileInputSection = {
  id: ListenerProfileSectionId;
  title: string;
  fields: Array<(typeof LISTENER_PROFILE_FIELDS)[number]>;
};

export const LISTENER_PROFILE_SECTIONS: ListenerProfileInputSection[] = Array.from(
  LISTENER_PROFILE_FIELDS.reduce((map, field) => {
    const existing = map.get(field.sectionId);
    if (existing) {
      existing.fields.push(field);
      return map;
    }
    map.set(field.sectionId, { id: field.sectionId, title: field.sectionTitle, fields: [field] });
    return map;
  }, new Map<ListenerProfileSectionId, ListenerProfileInputSection>())
).map((entry) => entry[1]);

export const EMPTY_LISTENER_PROFILE_INPUTS: ListenerProfileInputs = LISTENER_PROFILE_FIELDS.reduce(
  (acc, field) => {
    acc[field.key] = null;
    return acc;
  },
  {} as ListenerProfileInputs
);

export const normalizeListenerProfileInputs = (value: Record<string, unknown> | null | undefined): ListenerProfileInputs => {
  const normalized = { ...EMPTY_LISTENER_PROFILE_INPUTS };
  if (!value || typeof value !== 'object') return normalized;
  for (const field of LISTENER_PROFILE_FIELDS) {
    const raw = value[field.key];
    const next = typeof raw === 'string' ? raw.trim() : '';
    normalized[field.key] = next || null;
  }
  return normalized;
};

export type ListenerPersonaResult = {
  persona_name: string;
  age_range: string;
  location_tendency: string;
  lifestyle_summary: string;
  personality_traits: string;
  emotional_drivers: string;
  music_behavior: string;
  content_behavior: string;
  platform_usage: string;
  fashion_aesthetic: string;
  cultural_references: string;
  campaign_messaging: string;
  best_platforms: string;
  best_campaign_styles: string;
  confidence_score: string;
  missing_data_suggestions: string;
};

export const EMPTY_LISTENER_PERSONA_RESULT: ListenerPersonaResult = {
  persona_name: '',
  age_range: '',
  location_tendency: '',
  lifestyle_summary: '',
  personality_traits: '',
  emotional_drivers: '',
  music_behavior: '',
  content_behavior: '',
  platform_usage: '',
  fashion_aesthetic: '',
  cultural_references: '',
  campaign_messaging: '',
  best_platforms: '',
  best_campaign_styles: '',
  confidence_score: '',
  missing_data_suggestions: '',
};

export const parseListenerPersonaResult = (value: unknown): ListenerPersonaResult | null => {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const output = { ...EMPTY_LISTENER_PERSONA_RESULT };
  for (const key of Object.keys(output) as Array<keyof ListenerPersonaResult>) {
    output[key] = String(input[key] || '').trim();
  }
  const hasCoreContent = output.persona_name || output.lifestyle_summary || output.music_behavior || output.campaign_messaging;
  return hasCoreContent ? output : null;
};

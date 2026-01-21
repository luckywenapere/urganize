// =============================================
// URGANIZE - ARTIST PROFILE FORM
// =============================================
// components/releases/ArtistProfileForm.tsx

'use client';

import { useState } from 'react';
import { 
  User, 
  Instagram, 
  Music, 
  TrendingUp,
  Sparkles,
  ChevronRight,
  Plus,
  X,
  Check
} from 'lucide-react';
import { ArtistProfileFormData, CareerStage } from '@/types/ai-tasks';

// =============================================
// TYPES
// =============================================

interface ArtistProfileFormProps {
  initialData?: Partial<ArtistProfileFormData>;
  onSubmit: (data: ArtistProfileFormData) => Promise<void>;
  isLoading?: boolean;
}

// =============================================
// CONSTANTS
// =============================================

const CAREER_STAGES: { value: CareerStage; label: string; description: string }[] = [
  { value: 'emerging', label: 'Emerging', description: 'Just starting out, building my fanbase' },
  { value: 'growing', label: 'Growing', description: 'Have some traction, looking to scale' },
  { value: 'established', label: 'Established', description: 'Consistent releases, solid fanbase' },
];

const POPULAR_REFERENCE_ARTISTS = [
  'Burna Boy', 'Wizkid', 'Davido', 'Rema', 'Ayra Starr',
  'Asake', 'BNXN', 'Omah Lay', 'Tems', 'CKay',
  'Fireboy DML', 'Joeboy', 'Oxlade', 'Ruger', 'Pheelz'
];

// =============================================
// COMPONENT
// =============================================

export function ArtistProfileForm({ 
  initialData, 
  onSubmit, 
  isLoading = false 
}: ArtistProfileFormProps) {
  const [formData, setFormData] = useState<ArtistProfileFormData>({
    artistName: initialData?.artistName || '',
    brandAesthetic: initialData?.brandAesthetic || '',
    bio: initialData?.bio || '',
    pastReleasesCount: initialData?.pastReleasesCount || 0,
    bestStreamCount: initialData?.bestStreamCount || 0,
    careerStage: initialData?.careerStage || 'emerging',
    referenceArtists: initialData?.referenceArtists || [],
    instagramHandle: initialData?.instagramHandle || '',
    tiktokHandle: initialData?.tiktokHandle || '',
    twitterHandle: initialData?.twitterHandle || '',
    youtubeHandle: initialData?.youtubeHandle || '',
    spotifyUrl: initialData?.spotifyUrl || '',
    appleMusicUrl: initialData?.appleMusicUrl || '',
  });

  const [currentSection, setCurrentSection] = useState(0);
  const [newReferenceArtist, setNewReferenceArtist] = useState('');

  // Sections for step-by-step mobile UX
  const sections = [
    { id: 'identity', title: 'Identity', icon: User },
    { id: 'socials', title: 'Socials', icon: Instagram },
    { id: 'experience', title: 'Experience', icon: TrendingUp },
    { id: 'inspiration', title: 'Inspiration', icon: Sparkles },
  ];

  const updateField = <K extends keyof ArtistProfileFormData>(
    field: K, 
    value: ArtistProfileFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const addReferenceArtist = (artist: string) => {
    if (artist && !formData.referenceArtists.includes(artist)) {
      updateField('referenceArtists', [...formData.referenceArtists, artist]);
    }
    setNewReferenceArtist('');
  };

  const removeReferenceArtist = (artist: string) => {
    updateField('referenceArtists', formData.referenceArtists.filter(a => a !== artist));
  };

  const handleSubmit = async () => {
    await onSubmit(formData);
  };

  const canProceed = () => {
    switch (currentSection) {
      case 0: return formData.artistName.trim().length > 0;
      case 1: return true; // Socials are optional
      case 2: return true; // Experience is optional
      case 3: return true; // Inspiration is optional
      default: return true;
    }
  };

  const isLastSection = currentSection === sections.length - 1;

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Progress Header */}
      <div className="sticky top-0 z-10 bg-bg-surface/80 backdrop-blur-md border-b border-stroke-subtle">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-content-secondary">
              Artist Profile
            </h2>
            <span className="text-xs text-content-tertiary">
              {currentSection + 1} of {sections.length}
            </span>
          </div>
          
          {/* Progress bar */}
          <div className="flex gap-1">
            {sections.map((_, index) => (
              <div 
                key={index}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  index <= currentSection ? 'bg-brand' : 'bg-bg-elevated'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Section Content */}
      <div className="px-4 py-6">
        {/* Section 0: Identity */}
        {currentSection === 0 && (
          <div className="space-y-6 animate-in">
            <div>
              <h1 className="text-2xl font-bold text-content-primary mb-2">
                Let&apos;s set up your profile
              </h1>
              <p className="text-content-secondary">
                This helps us create personalized marketing strategies for your releases.
              </p>
            </div>

            {/* Artist Name */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Artist / Stage Name *
              </label>
              <input
                type="text"
                value={formData.artistName}
                onChange={(e) => updateField('artistName', e.target.value)}
                placeholder="Your artist name"
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
              />
            </div>

            {/* Brand Aesthetic */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Brand / Aesthetic
              </label>
              <p className="text-xs text-content-tertiary mb-2">
                Describe your vibe in a few words (e.g., &quot;dark and mysterious&quot;, &quot;upbeat and colorful&quot;)
              </p>
              <input
                type="text"
                value={formData.brandAesthetic}
                onChange={(e) => updateField('brandAesthetic', e.target.value)}
                placeholder="e.g., Street luxury, Afro-futuristic"
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
              />
            </div>

            {/* Short Bio */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Short Bio
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => updateField('bio', e.target.value)}
                placeholder="A brief description of who you are as an artist..."
                rows={3}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors resize-none"
              />
            </div>
          </div>
        )}

        {/* Section 1: Socials */}
        {currentSection === 1 && (
          <div className="space-y-6 animate-in">
            <div>
              <h1 className="text-2xl font-bold text-content-primary mb-2">
                Your social platforms
              </h1>
              <p className="text-content-secondary">
                Where are you most active? We&apos;ll focus your marketing here.
              </p>
            </div>

            <div className="space-y-4">
              {/* Instagram */}
              <div>
                <label className="block text-sm font-medium text-content-primary mb-2">
                  Instagram
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-content-tertiary">@</span>
                  <input
                    type="text"
                    value={formData.instagramHandle}
                    onChange={(e) => updateField('instagramHandle', e.target.value.replace('@', ''))}
                    placeholder="username"
                    className="flex-1 px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
                  />
                </div>
              </div>

              {/* TikTok */}
              <div>
                <label className="block text-sm font-medium text-content-primary mb-2">
                  TikTok
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-content-tertiary">@</span>
                  <input
                    type="text"
                    value={formData.tiktokHandle}
                    onChange={(e) => updateField('tiktokHandle', e.target.value.replace('@', ''))}
                    placeholder="username"
                    className="flex-1 px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
                  />
                </div>
              </div>

              {/* Twitter/X */}
              <div>
                <label className="block text-sm font-medium text-content-primary mb-2">
                  Twitter / X
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-content-tertiary">@</span>
                  <input
                    type="text"
                    value={formData.twitterHandle}
                    onChange={(e) => updateField('twitterHandle', e.target.value.replace('@', ''))}
                    placeholder="username"
                    className="flex-1 px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
                  />
                </div>
              </div>

              {/* YouTube */}
              <div>
                <label className="block text-sm font-medium text-content-primary mb-2">
                  YouTube Channel
                </label>
                <input
                  type="text"
                  value={formData.youtubeHandle}
                  onChange={(e) => updateField('youtubeHandle', e.target.value)}
                  placeholder="Channel name or URL"
                  className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
                />
              </div>

              {/* Spotify */}
              <div>
                <label className="block text-sm font-medium text-content-primary mb-2">
                  Spotify Artist URL
                </label>
                <input
                  type="url"
                  value={formData.spotifyUrl}
                  onChange={(e) => updateField('spotifyUrl', e.target.value)}
                  placeholder="https://open.spotify.com/artist/..."
                  className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
                />
              </div>

              {/* Apple Music */}
              <div>
                <label className="block text-sm font-medium text-content-primary mb-2">
                  Apple Music URL
                </label>
                <input
                  type="url"
                  value={formData.appleMusicUrl}
                  onChange={(e) => updateField('appleMusicUrl', e.target.value)}
                  placeholder="https://music.apple.com/artist/..."
                  className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
                />
              </div>
            </div>
          </div>
        )}

        {/* Section 2: Experience */}
        {currentSection === 2 && (
          <div className="space-y-6 animate-in">
            <div>
              <h1 className="text-2xl font-bold text-content-primary mb-2">
                Your experience
              </h1>
              <p className="text-content-secondary">
                This helps us tailor the complexity of your campaign.
              </p>
            </div>

            {/* Career Stage */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-3">
                Where are you in your career?
              </label>
              <div className="space-y-2">
                {CAREER_STAGES.map((stage) => (
                  <button
                    key={stage.value}
                    type="button"
                    onClick={() => updateField('careerStage', stage.value)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                      formData.careerStage === stage.value
                        ? 'border-brand bg-brand/10'
                        : 'border-stroke-subtle bg-bg-elevated hover:border-stroke-default'
                    }`}
                  >
                    <div className="text-left">
                      <p className={`font-medium ${
                        formData.careerStage === stage.value ? 'text-brand' : 'text-content-primary'
                      }`}>
                        {stage.label}
                      </p>
                      <p className="text-sm text-content-tertiary">{stage.description}</p>
                    </div>
                    {formData.careerStage === stage.value && (
                      <Check className="w-5 h-5 text-brand" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Past Releases */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                How many songs have you released?
              </label>
              <input
                type="number"
                min="0"
                value={formData.pastReleasesCount}
                onChange={(e) => updateField('pastReleasesCount', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
              />
            </div>

            {/* Best Stream Count */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Your best stream count (any platform)
              </label>
              <input
                type="number"
                min="0"
                value={formData.bestStreamCount}
                onChange={(e) => updateField('bestStreamCount', parseInt(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
              />
              <p className="text-xs text-content-tertiary mt-1">
                Total streams on your most successful release
              </p>
            </div>
          </div>
        )}

        {/* Section 3: Inspiration */}
        {currentSection === 3 && (
          <div className="space-y-6 animate-in">
            <div>
              <h1 className="text-2xl font-bold text-content-primary mb-2">
                Your inspiration
              </h1>
              <p className="text-content-secondary">
                Which artists inspire your sound and style?
              </p>
            </div>

            {/* Selected Artists */}
            {formData.referenceArtists.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.referenceArtists.map((artist) => (
                  <span
                    key={artist}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand/20 text-brand rounded-full text-sm"
                  >
                    {artist}
                    <button
                      type="button"
                      onClick={() => removeReferenceArtist(artist)}
                      className="hover:bg-brand/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add Custom Artist */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Add reference artists
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newReferenceArtist}
                  onChange={(e) => setNewReferenceArtist(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addReferenceArtist(newReferenceArtist);
                    }
                  }}
                  placeholder="Artist name"
                  className="flex-1 px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand transition-colors"
                />
                <button
                  type="button"
                  onClick={() => addReferenceArtist(newReferenceArtist)}
                  disabled={!newReferenceArtist.trim()}
                  className="px-4 py-3 bg-brand text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Add Popular Artists */}
            <div>
              <p className="text-sm text-content-tertiary mb-3">Quick add:</p>
              <div className="flex flex-wrap gap-2">
                {POPULAR_REFERENCE_ARTISTS
                  .filter(a => !formData.referenceArtists.includes(a))
                  .slice(0, 10)
                  .map((artist) => (
                    <button
                      key={artist}
                      type="button"
                      onClick={() => addReferenceArtist(artist)}
                      className="px-3 py-1.5 bg-bg-elevated border border-stroke-subtle rounded-full text-sm text-content-secondary hover:border-brand hover:text-brand transition-colors"
                    >
                      + {artist}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-bg-surface/80 backdrop-blur-md border-t border-stroke-subtle p-4">
        <div className="flex gap-3">
          {currentSection > 0 && (
            <button
              type="button"
              onClick={() => setCurrentSection(currentSection - 1)}
              className="flex-1 py-3 px-4 border border-stroke-subtle rounded-xl text-content-secondary font-medium hover:bg-bg-hover transition-colors"
            >
              Back
            </button>
          )}
          
          <button
            type="button"
            onClick={() => {
              if (isLastSection) {
                handleSubmit();
              } else {
                setCurrentSection(currentSection + 1);
              }
            }}
            disabled={!canProceed() || isLoading}
            className="flex-1 py-3 px-4 bg-brand text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isLastSection ? (
              'Complete Profile'
            ) : (
              <>
                Continue
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================
// URGANIZE - RELEASE SETUP WIZARD
// =============================================
// components/releases/ReleaseSetupWizard.tsx

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Music, 
  Users, 
  Wallet, 
  Target,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  MapPin,
  Calendar
} from 'lucide-react';
import { 
  SongStage, 
  FileLocation, 
  SetupStep,
  SongIntakeFormData 
} from '@/types/ai-tasks';

// =============================================
// TYPES
// =============================================

interface ReleaseSetupWizardProps {
  releaseId: string;
  releaseTitle: string;
  onComplete: (data: SetupWizardData) => Promise<void>;
  initialStep?: SetupStep;
  isLoading?: boolean;
}

export interface SetupWizardData {
  songIntake: SongIntakeFormData;
  targetAudience: {
    primaryMarket: string;
    targetAgeMin: number;
    targetAgeMax: number;
    targetAudienceDescription: string;
    listenerInterests: string[];
  };
  budgetTimeline: {
    budgetNaira: number;
    targetReleaseDate: string;
    hardDeadline?: string;
    deadlineReason?: string;
  };
  goals: {
    streamTargetRealistic: number;
    streamTargetStretch: number;
    playlistGoals: string;
    socialGrowthGoals: string;
    otherGoals?: string;
  };
}

// =============================================
// CONSTANTS
// =============================================

const SONG_STAGES: { value: SongStage; label: string; description: string }[] = [
  { value: 'idea', label: 'Idea', description: 'Just a concept or rough idea' },
  { value: 'demo', label: 'Demo', description: 'Basic recording exists' },
  { value: 'recording', label: 'Recording', description: 'Proper recording done' },
  { value: 'final', label: 'Final', description: 'Ready for release' },
];

const FILE_LOCATIONS: { value: FileLocation; label: string }[] = [
  { value: 'phone', label: 'On my phone' },
  { value: 'laptop', label: 'On my laptop/computer' },
  { value: 'google_drive', label: 'Google Drive' },
  { value: 'producer', label: 'With my producer' },
  { value: 'other', label: 'Other' },
];

const GENRES = [
  'Afrobeats', 'Afropop', 'Amapiano', 'Hip-Hop', 'R&B', 
  'Highlife', 'Fuji', 'Gospel', 'Reggae', 'Alternative'
];

const MOODS = [
  'Happy', 'Energetic', 'Chill', 'Romantic', 'Sad', 
  'Motivational', 'Party', 'Reflective', 'Aggressive', 'Dreamy'
];

const INTERESTS = [
  'Fashion', 'Sports', 'Tech', 'Art', 'Gaming',
  'Fitness', 'Food', 'Travel', 'Movies', 'Dance'
];

const NIGERIAN_CITIES = [
  'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano',
  'Benin City', 'Enugu', 'Kaduna', 'Warri', 'Jos'
];

// =============================================
// COMPONENT
// =============================================

export function ReleaseSetupWizard({
  releaseId,
  releaseTitle,
  onComplete,
  initialStep = 2, // Step 1 (Basic Info) already done during release creation
  isLoading = false,
}: ReleaseSetupWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<SetupStep>(initialStep);
  const [showOptional, setShowOptional] = useState(false);

  // Form state
  const [songIntake, setSongIntake] = useState<SongIntakeFormData>({
    songStage: 'demo',
    isMastered: false,
    fileLocation: 'phone',
    producer: '',
    featuredArtists: [],
    mood: '',
    genre: '',
    subgenre: '',
    isExplicit: false,
    hookTimestamp: '',
    songLength: '',
    hasSamples: false,
    sampleDetails: '',
    releaseConfidence: 3,
    isArtworkReady: false,
    songNotes: '',
    managerNotes: '',
  });

  const [targetAudience, setTargetAudience] = useState({
    primaryMarket: '',
    targetAgeMin: 18,
    targetAgeMax: 35,
    targetAudienceDescription: '',
    listenerInterests: [] as string[],
  });

  const [budgetTimeline, setBudgetTimeline] = useState({
    budgetNaira: 50000,
    targetReleaseDate: '',
    hardDeadline: '',
    deadlineReason: '',
  });

  const [goals, setGoals] = useState({
    streamTargetRealistic: 10000,
    streamTargetStretch: 50000,
    playlistGoals: '',
    socialGrowthGoals: '',
    otherGoals: '',
  });

  const steps = [
    { number: 1, title: 'Basic Info', icon: Music, complete: true },
    { number: 2, title: 'Song Details', icon: Music, complete: currentStep > 2 },
    { number: 3, title: 'Audience', icon: Users, complete: currentStep > 3 },
    { number: 4, title: 'Budget', icon: Wallet, complete: currentStep > 4 },
    { number: 5, title: 'Goals', icon: Target, complete: currentStep > 5 },
  ];

  const canProceed = () => {
    switch (currentStep) {
      case 2:
        return songIntake.songStage && songIntake.isMastered !== undefined && songIntake.fileLocation;
      case 3:
        return targetAudience.primaryMarket && targetAudience.targetAudienceDescription;
      case 4:
        return budgetTimeline.budgetNaira >= 0 && budgetTimeline.targetReleaseDate;
      case 5:
        return goals.streamTargetRealistic >= 0;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep < 5) {
      setCurrentStep((currentStep + 1) as SetupStep);
    } else {
      await onComplete({
        songIntake,
        targetAudience,
        budgetTimeline,
        goals,
      });
    }
  };

  const handleBack = () => {
    if (currentStep > 2) {
      setCurrentStep((currentStep - 1) as SetupStep);
    }
  };

  const toggleInterest = (interest: string) => {
    setTargetAudience(prev => ({
      ...prev,
      listenerInterests: prev.listenerInterests.includes(interest)
        ? prev.listenerInterests.filter(i => i !== interest)
        : [...prev.listenerInterests, interest]
    }));
  };

  return (
    <div className="min-h-screen bg-bg-base pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-bg-surface/80 backdrop-blur-md border-b border-stroke-subtle">
        <div className="px-4 py-3">
          <p className="text-sm text-content-tertiary mb-1">Setting up</p>
          <h1 className="text-lg font-semibold text-content-primary truncate">
            {releaseTitle}
          </h1>
          
          {/* Progress Steps */}
          <div className="flex items-center gap-1 mt-3">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center flex-1">
                <div className={`h-1 flex-1 rounded-full transition-colors ${
                  step.complete || step.number === currentStep ? 'bg-brand' : 'bg-bg-elevated'
                }`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-content-tertiary mt-2">
            Step {currentStep} of 5: {steps[currentStep - 1]?.title}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6">
        {/* Step 2: Song Intake */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-in">
            <div>
              <h2 className="text-2xl font-bold text-content-primary mb-2">
                Tell us about your song
              </h2>
              <p className="text-content-secondary">
                This helps us understand where you are in the process.
              </p>
            </div>

            {/* Song Stage - REQUIRED */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-3">
                What stage is the song? *
              </label>
              <div className="space-y-2">
                {SONG_STAGES.map((stage) => (
                  <button
                    key={stage.value}
                    type="button"
                    onClick={() => setSongIntake(prev => ({ ...prev, songStage: stage.value }))}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                      songIntake.songStage === stage.value
                        ? 'border-brand bg-brand/10'
                        : 'border-stroke-subtle bg-bg-elevated hover:border-stroke-default'
                    }`}
                  >
                    <div className="text-left">
                      <p className={`font-medium ${
                        songIntake.songStage === stage.value ? 'text-brand' : 'text-content-primary'
                      }`}>
                        {stage.label}
                      </p>
                      <p className="text-sm text-content-tertiary">{stage.description}</p>
                    </div>
                    {songIntake.songStage === stage.value && (
                      <Check className="w-5 h-5 text-brand" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Is Mastered - REQUIRED */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-3">
                Is the song mastered? *
              </label>
              <div className="flex gap-3">
                {[
                  { value: true, label: 'Yes' },
                  { value: false, label: 'No' },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => setSongIntake(prev => ({ ...prev, isMastered: option.value }))}
                    className={`flex-1 py-3 px-4 rounded-xl border font-medium transition-all ${
                      songIntake.isMastered === option.value
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-stroke-subtle bg-bg-elevated text-content-primary hover:border-stroke-default'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* File Location - REQUIRED */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-3">
                Where is the song file stored? *
              </label>
              <div className="space-y-2">
                {FILE_LOCATIONS.map((loc) => (
                  <button
                    key={loc.value}
                    type="button"
                    onClick={() => setSongIntake(prev => ({ ...prev, fileLocation: loc.value }))}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                      songIntake.fileLocation === loc.value
                        ? 'border-brand bg-brand/10'
                        : 'border-stroke-subtle bg-bg-elevated hover:border-stroke-default'
                    }`}
                  >
                    <span className={songIntake.fileLocation === loc.value ? 'text-brand' : 'text-content-primary'}>
                      {loc.label}
                    </span>
                    {songIntake.fileLocation === loc.value && (
                      <Check className="w-4 h-4 text-brand" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Fields Toggle */}
            <button
              type="button"
              onClick={() => setShowOptional(!showOptional)}
              className="w-full py-3 text-brand text-sm font-medium"
            >
              {showOptional ? 'Hide optional details' : 'Add optional details (recommended)'}
            </button>

            {/* Optional Fields */}
            {showOptional && (
              <div className="space-y-4 pt-4 border-t border-stroke-subtle">
                {/* Genre */}
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-2">
                    Genre
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {GENRES.map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => setSongIntake(prev => ({ ...prev, genre }))}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                          songIntake.genre === genre
                            ? 'bg-brand text-white'
                            : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
                        }`}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mood */}
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-2">
                    Mood / Vibe
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {MOODS.map((mood) => (
                      <button
                        key={mood}
                        type="button"
                        onClick={() => setSongIntake(prev => ({ ...prev, mood }))}
                        className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                          songIntake.mood === mood
                            ? 'bg-brand text-white'
                            : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
                        }`}
                      >
                        {mood}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hook Timestamp */}
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-2">
                    Hook / Catchiest Part Timestamp
                  </label>
                  <input
                    type="text"
                    value={songIntake.hookTimestamp}
                    onChange={(e) => setSongIntake(prev => ({ ...prev, hookTimestamp: e.target.value }))}
                    placeholder="e.g., 1:23"
                    className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand"
                  />
                </div>

                {/* Producer */}
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-2">
                    Producer
                  </label>
                  <input
                    type="text"
                    value={songIntake.producer}
                    onChange={(e) => setSongIntake(prev => ({ ...prev, producer: e.target.value }))}
                    placeholder="Producer name"
                    className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-content-primary mb-2">
                    Additional Notes
                  </label>
                  <textarea
                    value={songIntake.songNotes}
                    onChange={(e) => setSongIntake(prev => ({ ...prev, songNotes: e.target.value }))}
                    placeholder="Anything else we should know about this song..."
                    rows={3}
                    className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Target Audience */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-in">
            <div>
              <h2 className="text-2xl font-bold text-content-primary mb-2">
                Who is this for?
              </h2>
              <p className="text-content-secondary">
                Define your target audience so we can craft the right marketing approach.
              </p>
            </div>

            {/* Primary Market */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Primary Market / Location *
              </label>
              <p className="text-xs text-content-tertiary mb-3">
                <MapPin className="w-3 h-3 inline mr-1" />
                We recommend starting with your local market
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {NIGERIAN_CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => setTargetAudience(prev => ({ ...prev, primaryMarket: city }))}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      targetAudience.primaryMarket === city
                        ? 'bg-brand text-white'
                        : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={targetAudience.primaryMarket}
                onChange={(e) => setTargetAudience(prev => ({ ...prev, primaryMarket: e.target.value }))}
                placeholder="Or type a location..."
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand"
              />
            </div>

            {/* Age Range */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Target Age Range
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="13"
                  max="65"
                  value={targetAudience.targetAgeMin}
                  onChange={(e) => setTargetAudience(prev => ({ ...prev, targetAgeMin: parseInt(e.target.value) || 18 }))}
                  className="w-20 px-3 py-2 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary text-center focus:outline-none focus:border-brand"
                />
                <span className="text-content-tertiary">to</span>
                <input
                  type="number"
                  min="13"
                  max="65"
                  value={targetAudience.targetAgeMax}
                  onChange={(e) => setTargetAudience(prev => ({ ...prev, targetAgeMax: parseInt(e.target.value) || 35 }))}
                  className="w-20 px-3 py-2 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary text-center focus:outline-none focus:border-brand"
                />
                <span className="text-content-tertiary">years</span>
              </div>
            </div>

            {/* Audience Description */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Describe your ideal listener *
              </label>
              <textarea
                value={targetAudience.targetAudienceDescription}
                onChange={(e) => setTargetAudience(prev => ({ ...prev, targetAudienceDescription: e.target.value }))}
                placeholder="e.g., Young professionals who love Afrobeats and enjoy nightlife..."
                rows={3}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand resize-none"
              />
            </div>

            {/* Listener Interests */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                What are they interested in?
              </label>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((interest) => (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      targetAudience.listenerInterests.includes(interest)
                        ? 'bg-brand text-white'
                        : 'bg-bg-elevated text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Budget & Timeline */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-in">
            <div>
              <h2 className="text-2xl font-bold text-content-primary mb-2">
                Budget & Timeline
              </h2>
              <p className="text-content-secondary">
                This helps us create a realistic campaign plan.
              </p>
            </div>

            {/* Budget */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Marketing Budget (₦) *
              </label>
              <input
                type="number"
                min="0"
                step="5000"
                value={budgetTimeline.budgetNaira}
                onChange={(e) => setBudgetTimeline(prev => ({ ...prev, budgetNaira: parseInt(e.target.value) || 0 }))}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary focus:outline-none focus:border-brand"
              />
              {budgetTimeline.budgetNaira < 50000 && budgetTimeline.budgetNaira > 0 && (
                <div className="flex items-start gap-2 mt-2 p-3 bg-status-warning/10 border border-status-warning/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-status-warning flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-status-warning">
                    We recommend at least ₦50,000 for an effective campaign. Lower budgets will focus on organic strategies.
                  </p>
                </div>
              )}
            </div>

            {/* Release Date */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Target Release Date *
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-content-tertiary" />
                <input
                  type="date"
                  value={budgetTimeline.targetReleaseDate}
                  onChange={(e) => setBudgetTimeline(prev => ({ ...prev, targetReleaseDate: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full pl-12 pr-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            {/* Hard Deadline */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Hard Deadline (if any)
              </label>
              <input
                type="date"
                value={budgetTimeline.hardDeadline}
                onChange={(e) => setBudgetTimeline(prev => ({ ...prev, hardDeadline: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary focus:outline-none focus:border-brand"
              />
              {budgetTimeline.hardDeadline && (
                <input
                  type="text"
                  value={budgetTimeline.deadlineReason}
                  onChange={(e) => setBudgetTimeline(prev => ({ ...prev, deadlineReason: e.target.value }))}
                  placeholder="Why this deadline? (e.g., event, season)"
                  className="w-full mt-2 px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand"
                />
              )}
            </div>
          </div>
        )}

        {/* Step 5: Goals */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-in">
            <div>
              <h2 className="text-2xl font-bold text-content-primary mb-2">
                Set your goals
              </h2>
              <p className="text-content-secondary">
                What does success look like for this release?
              </p>
            </div>

            {/* Stream Targets */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Stream Target (Realistic)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={goals.streamTargetRealistic}
                onChange={(e) => setGoals(prev => ({ ...prev, streamTargetRealistic: parseInt(e.target.value) || 0 }))}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary focus:outline-none focus:border-brand"
              />
              <p className="text-xs text-content-tertiary mt-1">
                A goal you&apos;re confident you can hit
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Stream Target (Stretch)
              </label>
              <input
                type="number"
                min="0"
                step="1000"
                value={goals.streamTargetStretch}
                onChange={(e) => setGoals(prev => ({ ...prev, streamTargetStretch: parseInt(e.target.value) || 0 }))}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary focus:outline-none focus:border-brand"
              />
              <p className="text-xs text-content-tertiary mt-1">
                An ambitious goal if everything goes well
              </p>
            </div>

            {/* Playlist Goals */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Playlist Goals
              </label>
              <textarea
                value={goals.playlistGoals}
                onChange={(e) => setGoals(prev => ({ ...prev, playlistGoals: e.target.value }))}
                placeholder="e.g., Get on 5 Spotify editorial playlists, Audiomack trending..."
                rows={2}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand resize-none"
              />
            </div>

            {/* Social Growth Goals */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Social Media Growth Goals
              </label>
              <textarea
                value={goals.socialGrowthGoals}
                onChange={(e) => setGoals(prev => ({ ...prev, socialGrowthGoals: e.target.value }))}
                placeholder="e.g., Gain 1000 Instagram followers, Go viral on TikTok..."
                rows={2}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand resize-none"
              />
            </div>

            {/* Other Goals */}
            <div>
              <label className="block text-sm font-medium text-content-primary mb-2">
                Other Goals
              </label>
              <textarea
                value={goals.otherGoals}
                onChange={(e) => setGoals(prev => ({ ...prev, otherGoals: e.target.value }))}
                placeholder="Any other goals for this release..."
                rows={2}
                className="w-full px-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand resize-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-bg-surface/80 backdrop-blur-md border-t border-stroke-subtle p-4">
        <div className="flex gap-3">
          {currentStep > 2 && (
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 py-3 px-4 border border-stroke-subtle rounded-xl text-content-secondary font-medium hover:bg-bg-hover transition-colors flex items-center justify-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}
          
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed() || isLoading}
            className="flex-1 py-3 px-4 bg-brand text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : currentStep === 5 ? (
              <>
                Generate Campaign
                <Sparkles className="w-4 h-4" />
              </>
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

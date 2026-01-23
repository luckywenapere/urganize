// app/releases/[id]/tasks/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft,
  Music,
  Calendar,
  CheckCircle2,
  SkipForward,
  Map,
  Loader2,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/lib/release-store';
import { useArtistProfileStore } from '@/lib/artist-profile-store';
import { useReleaseProfileStore } from '@/lib/release-profile-store';
import { useAITaskStore } from '@/lib/ai-task-store';
import { CurrentTaskCard } from '@/components/releases/CurrentTaskCard';
import { SkippedTasksPanel } from '@/components/releases/SkippedTasksPanel';
import { RoadmapView } from '@/components/releases/RoadmapView';
import { CompletionScreen } from '@/components/releases/CompletionScreen';
import type { TaskPhase } from '@/types';

// =============================================
// PHASE DISPLAY CONFIG
// =============================================

const PHASE_CONFIG: Record<TaskPhase, { label: string; color: string; bgColor: string }> = {
  'pre-production': { 
    label: 'Pre-Production', 
    color: 'text-blue-400', 
    bgColor: 'bg-blue-500/20' 
  },
  'production': { 
    label: 'Production', 
    color: 'text-purple-400', 
    bgColor: 'bg-purple-500/20' 
  },
  'promotion': { 
    label: 'Promotion', 
    color: 'text-orange-400', 
    bgColor: 'bg-orange-500/20' 
  },
  'distribution': { 
    label: 'Distribution', 
    color: 'text-green-400', 
    bgColor: 'bg-green-500/20' 
  },
};

// =============================================
// AUDIO STATUS BADGE
// =============================================

function AudioStatusBadge({ status }: { status: string }) {
  const config = {
    ready: { label: 'Audio Ready', color: 'text-green-400', bg: 'bg-green-500/20' },
    needs_changes: { label: 'Audio Needs Work', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    missing: { label: 'Audio Missing', color: 'text-red-400', bg: 'bg-red-500/20' },
  }[status] || { label: 'Unknown', color: 'text-gray-400', bg: 'bg-gray-500/20' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
      <Music className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// =============================================
// MAIN PAGE COMPONENT
// =============================================

export default function ReleaseTasksPage() {
  const params = useParams();
  const router = useRouter();
  const releaseId = params.id as string;

  // Global state
  const { user, isAuthenticated } = useAuthStore();
  const { releases, fetchReleases } = useReleaseStore();
  const { profile: artistProfile, fetchProfile: fetchArtistProfile } = useArtistProfileStore();
  const { 
    profile: releaseProfile, 
    fetchProfile: fetchReleaseProfile 
  } = useReleaseProfileStore();
  const {
    currentTask,
    tasks,
    skippedTasks,
    isLoading,
    isGenerating,
    isCompletingTask,
    totalTasksEstimate,
    completedCount,
    skippedCount,
    currentPhase,
    error,
    fetchTasksForRelease,
    generateInitialTasks,
    generateMoreTasks,
    completeTask,
    skipTask,
    goBackToPreviousTask,
    requestVariant,
    clearError,
  } = useAITaskStore();

  // Local state
  const [showSkippedPanel, setShowSkippedPanel] = useState(false);
  const [showRoadmap, setShowRoadmap] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // Get release data
  const release = releases.find(r => r.id === releaseId);

  // =============================================
  // INITIALIZATION
  // =============================================

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    const initializePage = async () => {
      setIsInitializing(true);
      
      try {
        // Fetch release if not in store
        if (releases.length === 0) {
          await fetchReleases();
        }

        // Fetch artist profile
        await fetchArtistProfile();

        // Fetch release profile
        const profile = await fetchReleaseProfile(releaseId);

        // If setup not complete, redirect to setup wizard
        if (!profile || !profile.setupCompleted) {
          router.push(`/releases/${releaseId}/setup`);
          return;
        }

        // Fetch existing tasks
        await fetchTasksForRelease(releaseId);

      } catch (err) {
        console.error('Failed to initialize:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    initializePage();
  }, [isAuthenticated, releaseId]);

  // =============================================
  // GENERATE INITIAL TASKS IF NEEDED
  // =============================================

  useEffect(() => {
    const generateIfNeeded = async () => {
      // Only generate if we have profiles and no tasks exist
      if (
        !isInitializing &&
        !isGenerating &&
        artistProfile &&
        releaseProfile?.setupCompleted &&
        release &&
        tasks.length === 0
      ) {
        await generateInitialTasks(
          artistProfile,
          releaseProfile,
          releaseId,
          release.title,
          release.type,
          user!.id
        );
      }
    };

    generateIfNeeded();
  }, [isInitializing, artistProfile, releaseProfile, release, tasks.length]);

  // =============================================
  // CHECK IF MORE TASKS NEEDED
  // =============================================

  useEffect(() => {
    const checkNeedMoreTasks = async () => {
      // Generate more tasks when we're running low on pending tasks
      const pendingTasks = tasks.filter(t => t.status === 'pending');
      
      if (
        !isGenerating &&
        artistProfile &&
        releaseProfile &&
        pendingTasks.length <= 2 &&
        completedCount < totalTasksEstimate &&
        tasks.length > 0
      ) {
        await generateMoreTasks(artistProfile, releaseProfile, releaseId, user!.id);
      }
    };

    checkNeedMoreTasks();
  }, [completedCount, tasks.length]);

  // =============================================
  // HANDLERS
  // =============================================

  const handleCompleteTask = async (userInput: string, inputData?: any) => {
    if (!currentTask) return;
    await completeTask(currentTask.id, userInput, inputData);
  };

  const handleSkipTask = async () => {
    if (!currentTask) return;
    await skipTask(currentTask.id);
  };

  const handleGoBack = async () => {
    await goBackToPreviousTask();
  };

  const handleRequestVariant = async () => {
    if (!currentTask || !artistProfile || !releaseProfile) return;
    await requestVariant(currentTask.id, artistProfile, releaseProfile);
  };

  // =============================================
  // COMPUTED VALUES
  // =============================================

  const daysUntilRelease = releaseProfile?.targetReleaseDate
    ? Math.ceil((new Date(releaseProfile.targetReleaseDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const progressPercent = totalTasksEstimate > 0
    ? Math.round((completedCount / totalTasksEstimate) * 100)
    : 0;

  const isCampaignComplete = completedCount >= totalTasksEstimate && totalTasksEstimate > 0;
  const canGoBack = tasks.findIndex(t => t.id === currentTask?.id) > 0;

  // =============================================
  // LOADING STATE
  // =============================================

  if (isInitializing || isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand animate-spin mx-auto mb-4" />
          <p className="text-content-secondary">Loading your campaign...</p>
        </div>
      </div>
    );
  }

  // =============================================
  // CAMPAIGN COMPLETE
  // =============================================

  if (isCampaignComplete) {
    return (
      <CompletionScreen
        releaseTitle={release?.title || 'Release'}
        artistName={release?.artistName || artistProfile?.artistName || 'Artist'}
        totalTasks={totalTasksEstimate}
        completedTasks={completedCount}
        skippedTasks={skippedCount}
        releaseDate={releaseProfile?.targetReleaseDate}
        onViewRelease={() => router.push(`/releases/${releaseId}`)}
        onBackToDashboard={() => router.push('/dashboard')}
      />
    );
  }

  // =============================================
  // GENERATING INITIAL TASKS
  // =============================================

  if (isGenerating && tasks.length === 0) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-brand/20 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-brand animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-content-primary mb-2">
            Creating Your Campaign
          </h2>
          <p className="text-content-secondary mb-6">
            Our AI is crafting a personalized marketing strategy for &quot;{release?.title}&quot;...
          </p>
          <div className="w-full bg-bg-elevated rounded-full h-2 overflow-hidden">
            <div className="h-full bg-brand rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  // =============================================
  // MAIN RENDER
  // =============================================

  const phaseConfig = PHASE_CONFIG[currentPhase];

  return (
    <div className="min-h-screen bg-bg-base pb-4">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-bg-surface/80 backdrop-blur-md border-b border-stroke-subtle">
        <div className="px-4 py-3">
          {/* Top Row */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => router.push(`/releases/${releaseId}`)}
              className="flex items-center gap-2 text-content-secondary hover:text-content-primary transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Back</span>
            </button>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowRoadmap(true)}
                className="p-2 text-content-tertiary hover:text-content-primary transition-colors"
                title="View Roadmap"
              >
                <Map className="w-5 h-5" />
              </button>
              {skippedCount > 0 && (
                <button
                  onClick={() => setShowSkippedPanel(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-status-warning/20 text-status-warning rounded-full text-sm font-medium"
                >
                  <SkipForward className="w-4 h-4" />
                  {skippedCount}
                </button>
              )}
            </div>
          </div>

          {/* Release Info */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-content-primary truncate">
                {release?.title || 'Release'}
              </h1>
              <p className="text-sm text-content-tertiary">
                {release?.artistName || artistProfile?.artistName}
              </p>
            </div>

            {/* Days Until Release */}
            {daysUntilRelease !== null && (
              <div className="flex items-center gap-1.5 text-content-secondary">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {daysUntilRelease > 0 ? `${daysUntilRelease}d` : 'Today!'}
                </span>
              </div>
            )}
          </div>

          {/* Status Row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Audio Status */}
            {releaseProfile && (
              <AudioStatusBadge status={releaseProfile.primaryAudioStatus} />
            )}

            {/* Current Phase */}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${phaseConfig.bgColor} ${phaseConfig.color}`}>
              {phaseConfig.label}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-content-tertiary mb-1">
              <span>{completedCount} of ~{totalTasksEstimate} tasks</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-bg-elevated rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-brand rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 p-4 bg-status-error/10 border border-status-error/20 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-status-error flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-status-error font-medium">Something went wrong</p>
            <p className="text-sm text-content-secondary mt-1">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="text-content-tertiary hover:text-content-primary"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="px-4 py-6">
        {currentTask ? (
          <CurrentTaskCard
            task={currentTask}
            taskNumber={completedCount + 1}
            totalTasks={totalTasksEstimate}
            variantsRemaining={currentTask.maxVariants - currentTask.variantCount}
            isCompleting={isCompletingTask}
            isGeneratingVariant={isGenerating}
            onComplete={handleCompleteTask}
            onSkip={handleSkipTask}
            onGoBack={handleGoBack}
            onRequestVariant={handleRequestVariant}
            canGoBack={canGoBack}
          />
        ) : (
          <div className="text-center py-12">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-content-primary mb-2">
              All caught up!
            </h2>
            <p className="text-content-secondary">
              {isGenerating 
                ? 'Generating more tasks...' 
                : 'No more tasks at the moment.'}
            </p>
          </div>
        )}
      </main>

      {/* Skipped Tasks Panel */}
      {showSkippedPanel && (
        <SkippedTasksPanel
          tasks={skippedTasks}
          onClose={() => setShowSkippedPanel(false)}
          onCompleteTask={async (taskId, userInput) => {
            const { completeSkippedTask } = useAITaskStore.getState();
            await completeSkippedTask(taskId, userInput);
          }}
        />
      )}

      {/* Roadmap View */}
      {showRoadmap && (
        <RoadmapView
          tasks={tasks}
          currentPhase={currentPhase}
          onClose={() => setShowRoadmap(false)}
        />
      )}
    </div>
  );
}

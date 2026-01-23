// app/releases/[id]/page.tsx
// Updated with AI Campaign integration
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useReleaseStore } from '@/lib/release-store';
import { useTaskStore } from '@/lib/task-store';
import { useFileStore, hasRequiredAudioFile } from '@/lib/file-store';
import { useReleaseProfileStore } from '@/lib/release-profile-store';
import { useAITaskStore } from '@/lib/ai-task-store';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { ProgressBar, CircularProgress } from '@/components/ui/Progress';
import { Logo } from '@/components/ui/Logo';
import { TaskList } from '@/components/tasks/TaskList';
import { 
  ArrowLeft, Calendar, Settings, AlertTriangle, Music,
  LayoutDashboard, ListTodo, FolderOpen, ChevronRight,
  Sparkles, Rocket, CheckCircle2, Clock, Play
} from 'lucide-react';
import { differenceInDays } from 'date-fns';

type Tab = 'overview' | 'tasks';

export default function ReleaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const releaseId = params.id as string;

  // Existing stores
  const { releases } = useReleaseStore();
  const { getTasksByRelease, fetchTasksByRelease } = useTaskStore();
  const { getFilesByRelease, files } = useFileStore();
  
  // New AI stores
  const { profile: releaseProfile, fetchProfile: fetchReleaseProfile } = useReleaseProfileStore();
  const { 
    tasks: aiTasks, 
    completedCount: aiCompletedCount,
    totalTasksEstimate,
    fetchTasksForRelease: fetchAITasks 
  } = useAITaskStore();

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  const release = releases.find((r) => r.id === releaseId);

  // Fetch release data
  useEffect(() => {
    if (releaseId) {
      fetchTasksByRelease(releaseId);
      
      // Fetch AI-related data
      const loadAIData = async () => {
        setIsLoadingProfile(true);
        try {
          await fetchReleaseProfile(releaseId);
          await fetchAITasks(releaseId);
        } finally {
          setIsLoadingProfile(false);
        }
      };
      loadAIData();
    }
  }, [releaseId, fetchTasksByRelease]);

  useEffect(() => {
    if (!release) router.push('/dashboard');
  }, [release, router]);

  if (!release) return null;

  // Legacy task data
  const tasks = getTasksByRelease(releaseId);
  const releaseFiles = getFilesByRelease(releaseId);
  const hasAudio = hasRequiredAudioFile(releaseId, files);
  
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const healthScore = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  // AI Campaign data
  const hasAICampaign = releaseProfile?.setupCompleted && aiTasks.length > 0;
  const aiProgressPercent = totalTasksEstimate > 0 
    ? Math.round((aiCompletedCount / totalTasksEstimate) * 100) 
    : 0;

  const daysUntil = release.releaseDate 
    ? differenceInDays(new Date(release.releaseDate), new Date())
    : releaseProfile?.targetReleaseDate
      ? differenceInDays(new Date(releaseProfile.targetReleaseDate), new Date())
      : null;

  const warnings = [
    ...(!hasAudio && !releaseProfile?.fileLocation ? [{ text: 'Missing required audio file', icon: '🎵' }] : []),
    ...(!release.releaseDate && !releaseProfile?.targetReleaseDate ? [{ text: 'Release date not set', icon: '📅' }] : []),
    ...(releaseFiles.filter(f => f.category === 'artwork').length === 0 && !releaseProfile?.isArtworkReady ? [{ text: 'No artwork uploaded', icon: '🖼️' }] : []),
  ];

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'tasks', label: 'Legacy Tasks', icon: <ListTodo className="w-4 h-4" />, count: pendingTasks.length },
  ];

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg-surface/80 backdrop-blur-md border-b border-stroke-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard">
                <Logo size="sm" />
              </Link>
              <ChevronRight className="w-4 h-4 text-content-tertiary" />
              <div>
                <h1 className="font-semibold text-content-primary">{release.title}</h1>
                <p className="text-sm text-content-secondary">{release.artistName}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {daysUntil !== null && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elevated">
                  <Calendar className="w-4 h-4 text-content-tertiary" />
                  <span className="text-sm font-medium text-content-primary">
                    {daysUntil > 0 ? `${daysUntil} days` : daysUntil === 0 ? 'Today!' : 'Released'}
                  </span>
                </div>
              )}
              <IconButton variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </IconButton>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-stroke-subtle bg-bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-brand text-brand'
                    : 'border-transparent text-content-secondary hover:text-content-primary'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="px-1.5 py-0.5 text-xs rounded-full bg-bg-elevated">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            
            {/* AI Campaign Card - PRIMARY CTA */}
            <Card padding="lg" className="border-2 border-brand/20 bg-gradient-to-br from-brand/5 to-transparent">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-brand/20 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-7 h-7 text-brand" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-content-primary mb-1">
                      {hasAICampaign ? 'AI Marketing Campaign' : 'Start Your AI Campaign'}
                    </h2>
                    {hasAICampaign ? (
                      <>
                        <p className="text-content-secondary mb-3">
                          {releaseProfile?.campaignNarrative || 'Your personalized marketing campaign is in progress.'}
                        </p>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                            <span className="text-content-primary font-medium">{aiCompletedCount} done</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-content-tertiary" />
                            <span className="text-content-secondary">~{totalTasksEstimate - aiCompletedCount} remaining</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-content-secondary">
                        Get a personalized, AI-powered marketing strategy with step-by-step tasks tailored to your release.
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-3">
                  {hasAICampaign && (
                    <div className="text-right mb-2">
                      <span className="text-3xl font-bold text-brand">{aiProgressPercent}%</span>
                      <p className="text-xs text-content-tertiary">complete</p>
                    </div>
                  )}
                  <Button
                    onClick={() => router.push(
                      hasAICampaign 
                        ? `/releases/${releaseId}/tasks` 
                        : `/releases/${releaseId}/setup`
                    )}
                    size="lg"
                    className="whitespace-nowrap"
                  >
                    {hasAICampaign ? (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Continue Campaign
                      </>
                    ) : (
                      <>
                        <Rocket className="w-4 h-4 mr-2" />
                        Start Campaign
                      </>
                    )}
                  </Button>
                </div>
              </div>
              
              {/* Progress bar for active campaigns */}
              {hasAICampaign && (
                <div className="mt-6 pt-6 border-t border-stroke-subtle">
                  <div className="flex items-center justify-between text-xs text-content-tertiary mb-2">
                    <span>Campaign Progress</span>
                    <span>{aiCompletedCount} of ~{totalTasksEstimate} tasks</span>
                  </div>
                  <div className="w-full bg-bg-elevated rounded-full h-3 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-brand to-purple-500 rounded-full transition-all duration-500"
                      style={{ width: `${aiProgressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Health Score */}
              <Card className="lg:col-span-2" padding="lg">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-content-primary">Release Health</h2>
                    <p className="text-sm text-content-secondary">Track your release progress</p>
                  </div>
                  <CircularProgress value={healthScore} size={80} strokeWidth={8} showLabel={true} />
                </div>
                
                <ProgressBar value={healthScore} className="mb-4" />
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-content-secondary">
                    {completedTasks.length} of {tasks.length} tasks completed
                  </span>
                  <StatusBadge status={release.status} />
                </div>
              </Card>

              {/* Warnings */}
              {warnings.length > 0 && (
                <Card padding="lg">
                  <h3 className="font-semibold text-content-primary mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-status-warning" />
                    Needs Attention
                  </h3>
                  <div className="space-y-3">
                    {warnings.map((warning, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-status-warning/10">
                        <span>{warning.icon}</span>
                        <span className="text-sm text-content-primary">{warning.text}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* No warnings - show quick stats instead */}
              {warnings.length === 0 && (
                <Card padding="lg">
                  <h3 className="font-semibold text-content-primary mb-4 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    Looking Good!
                  </h3>
                  <p className="text-sm text-content-secondary">
                    No critical issues detected. Keep up the momentum!
                  </p>
                </Card>
              )}

              {/* Next Steps */}
              <Card className="lg:col-span-3" padding="lg">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-content-primary">Next Steps</h3>
                  {hasAICampaign && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => router.push(`/releases/${releaseId}/tasks`)}
                    >
                      View AI Tasks →
                    </Button>
                  )}
                </div>
                
                {hasAICampaign && aiTasks.length > 0 ? (
                  // Show AI tasks if campaign is active
                  <div className="space-y-2">
                    {aiTasks
                      .filter(t => t.status === 'current' || t.status === 'pending')
                      .slice(0, 5)
                      .map((task, index) => (
                        <div 
                          key={task.id} 
                          className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                            task.status === 'current' 
                              ? 'bg-brand/10 border border-brand/20' 
                              : 'bg-bg-elevated hover:bg-bg-hover'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full ${
                            task.status === 'current' ? 'bg-brand animate-pulse' : 'bg-content-tertiary'
                          }`} />
                          <span className={`text-sm flex-1 ${
                            task.status === 'current' ? 'text-brand font-medium' : 'text-content-primary'
                          }`}>
                            {task.title}
                          </span>
                          {task.status === 'current' && (
                            <span className="text-xs text-brand font-medium">Current</span>
                          )}
                          <span className="text-xs text-content-tertiary capitalize">{task.phase.replace('-', ' ')}</span>
                        </div>
                      ))}
                    <button 
                      onClick={() => router.push(`/releases/${releaseId}/tasks`)}
                      className="text-sm text-brand hover:underline mt-2"
                    >
                      Continue campaign →
                    </button>
                  </div>
                ) : (
                  // Show legacy tasks if no AI campaign
                  <div className="space-y-2">
                    {pendingTasks.slice(0, 5).map((task) => (
                      <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated hover:bg-bg-hover transition-colors">
                        <div className="w-2 h-2 rounded-full bg-brand" />
                        <span className="text-sm text-content-primary flex-1">{task.title}</span>
                        <span className="text-xs text-content-tertiary">{task.phase}</span>
                      </div>
                    ))}
                    {pendingTasks.length > 5 && (
                      <button 
                        onClick={() => setActiveTab('tasks')}
                        className="text-sm text-brand hover:underline"
                      >
                        View all {pendingTasks.length} tasks →
                      </button>
                    )}
                    {pendingTasks.length === 0 && !hasAICampaign && (
                      <div className="text-center py-8">
                        <Sparkles className="w-10 h-10 text-brand/40 mx-auto mb-3" />
                        <p className="text-content-secondary mb-4">
                          Start your AI-powered campaign for personalized marketing tasks
                        </p>
                        <Button onClick={() => router.push(`/releases/${releaseId}/setup`)}>
                          <Rocket className="w-4 h-4 mr-2" />
                          Start Campaign
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div>
            <div className="mb-6 p-4 bg-brand/5 border border-brand/20 rounded-xl">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-brand" />
                <div className="flex-1">
                  <p className="text-sm text-content-primary font-medium">
                    Try the new AI-powered campaign
                  </p>
                  <p className="text-xs text-content-secondary">
                    Get personalized marketing tasks tailored to your release
                  </p>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => router.push(`/releases/${releaseId}/${hasAICampaign ? 'tasks' : 'setup'}`)}
                >
                  {hasAICampaign ? 'Continue' : 'Try it'}
                </Button>
              </div>
            </div>
            <TaskList releaseId={releaseId} />
          </div>
        )}
      </main>
    </div>
  );
}

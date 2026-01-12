'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useReleaseStore } from '@/lib/release-store';
import { useTaskStore } from '@/lib/task-store';
import { useFileStore, hasRequiredAudioFile } from '@/lib/file-store';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { ProgressBar, CircularProgress } from '@/components/ui/Progress';
import { Logo } from '@/components/ui/Logo';
import { TaskList } from '@/components/tasks/TaskList';
import { FileUpload } from '@/components/files/FileUpload';
import { 
  ArrowLeft, Calendar, Settings, AlertTriangle, Music,
  LayoutDashboard, ListTodo, FolderOpen, ChevronRight
} from 'lucide-react';
import { differenceInDays } from 'date-fns';

type Tab = 'overview' | 'tasks' | 'files';

export default function ReleaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const releaseId = params.id as string;

  const { releases } = useReleaseStore();
  const { getTasksByRelease, fetchTasksByRelease } = useTaskStore();

	useEffect(() => {
	  if (releaseId) {
		fetchTasksByRelease(releaseId);
		fetchFilesByRelease(releaseId);
	  }
	}, [releaseId, fetchTasksByRelease]);

  const { getFilesByRelease, files, fetchFilesByRelease } = useFileStore();
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const release = releases.find((r) => r.id === releaseId);

  useEffect(() => {
    if (!release) router.push('/dashboard');
  }, [release, router]);

  if (!release) return null;

  const tasks = getTasksByRelease(releaseId);
  const releaseFiles = getFilesByRelease(releaseId);
  const hasAudio = hasRequiredAudioFile(releaseId, files);
  
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const healthScore = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  const daysUntil = release.releaseDate 
    ? differenceInDays(new Date(release.releaseDate), new Date())
    : null;

  const warnings = [
    ...(!hasAudio ? [{ text: 'Missing required audio file', icon: '🎵' }] : []),
    ...(!release.releaseDate ? [{ text: 'Release date not set', icon: '📅' }] : []),
    ...(releaseFiles.filter(f => f.category === 'artwork').length === 0 ? [{ text: 'No artwork uploaded', icon: '🖼️' }] : []),
  ];

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { key: 'tasks', label: 'Tasks', icon: <ListTodo className="w-4 h-4" />, count: pendingTasks.length },
    { key: 'files', label: 'Files', icon: <FolderOpen className="w-4 h-4" />, count: releaseFiles.length },
  ];

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-stroke-subtle">
        <div className="max-w-[1200px] mx-auto px-4 py-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-content-tertiary hover:text-content-primary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              {/* Cover */}
              <div className="w-20 h-20 rounded-xl bg-bg-elevated border border-stroke-subtle flex items-center justify-center overflow-hidden flex-shrink-0">
                {release.coverArt ? (
                  <img src={release.coverArt} alt={release.title} className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-8 h-8 text-content-quaternary" />
                )}
              </div>

              <div>
                <h1 className="text-xl font-semibold text-content-primary mb-1">{release.title}</h1>
                <p className="text-content-secondary mb-2">{release.artistName}</p>
                <div className="flex items-center gap-3">
                  <StatusBadge status={release.status} />
                  {daysUntil !== null && (
                    <span className={`flex items-center gap-1.5 text-sm ${
                      daysUntil <= 7 ? 'text-status-warning' : 'text-content-tertiary'
                    }`}>
                      <Calendar className="w-4 h-4" />
                      {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : 
                       daysUntil === 0 ? 'Today' : `${daysUntil}d left`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <IconButton tooltip="Settings">
              <Settings className="w-[18px] h-[18px]" />
            </IconButton>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-[1200px] mx-auto px-4">
          <div className="flex gap-1 border-b border-stroke-subtle -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-brand text-brand'
                    : 'border-transparent text-content-tertiary hover:text-content-primary'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    activeTab === tab.key ? 'bg-brand/20 text-brand' : 'bg-bg-elevated text-content-tertiary'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-[1200px] mx-auto px-4 py-6">
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in">
            {/* Health Card */}
            <Card padding="lg">
              <div className="flex items-center justify-between gap-6">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-content-primary mb-4">Release Health</h2>
                  <ProgressBar value={healthScore} size="lg" showLabel label="Overall Progress" />
                  <p className="text-sm text-content-tertiary mt-2">
                    {completedTasks.length} of {tasks.length} tasks completed
                  </p>
                </div>
                <CircularProgress value={healthScore} size={80} strokeWidth={6} />
              </div>
            </Card>

            {/* Warnings */}
            {warnings.length > 0 && (
              <Card className="border-status-warning/30 bg-status-warning/5" padding="md">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-status-warning/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-status-warning" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-status-warning mb-2">Missing Items</h3>
                    <div className="space-y-1.5">
                      {warnings.map((w, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-content-secondary">
                          <span>{w.icon}</span>
                          <span>{w.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('files')} rightIcon={<ChevronRight className="w-4 h-4" />}>
                    Fix
                  </Button>
                </div>
              </Card>
            )}

            {/* Next Up */}
            <Card>
              <h2 className="text-lg font-semibold text-content-primary mb-4">Next Up</h2>
              {pendingTasks.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-brand/20 flex items-center justify-center">
                    <span className="text-2xl">🎉</span>
                  </div>
                  <p className="text-content-secondary">All tasks completed!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingTasks.slice(0, 5).map((task, i) => (
                    <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated border border-stroke-subtle">
                      <span className="w-6 h-6 rounded bg-bg-overlay flex items-center justify-center text-xs font-semibold text-content-tertiary">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium text-content-primary">{task.title}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="ghost" onClick={() => setActiveTab('tasks')} className="w-full mt-4" rightIcon={<ChevronRight className="w-4 h-4" />}>
                View All Tasks
              </Button>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Tasks Remaining', value: pendingTasks.length, color: 'text-status-warning' },
                { label: 'Files Uploaded', value: releaseFiles.length, color: 'text-status-info' },
                { label: 'Completed', value: completedTasks.length, color: 'text-brand' },
              ].map((stat) => (
                <Card key={stat.label} padding="md">
                  <p className="text-sm text-content-tertiary mb-1">{stat.label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="animate-in">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-content-primary mb-1">Tasks</h2>
              <p className="text-sm text-content-tertiary">{pendingTasks.length} remaining of {tasks.length} total</p>
            </div>
            <TaskList releaseId={releaseId} />
          </div>
        )}

        {activeTab === 'files' && (
          <div className="animate-in">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-content-primary mb-1">Files</h2>
              <p className="text-sm text-content-tertiary">{releaseFiles.length} files uploaded</p>
            </div>
            <FileUpload releaseId={releaseId} />
          </div>
        )}
      </main>
    </div>
  );
}

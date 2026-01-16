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
import { 
  ArrowLeft, Calendar, Settings, AlertTriangle, Music,
  LayoutDashboard, ListTodo, FolderOpen, ChevronRight
} from 'lucide-react';
import { differenceInDays } from 'date-fns';

type Tab = 'overview' | 'tasks';  

export default function ReleaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const releaseId = params.id as string;

  const { releases } = useReleaseStore();
  const { getTasksByRelease, fetchTasksByRelease } = useTaskStore();

  useEffect(() => {
    if (releaseId) {
      fetchTasksByRelease(releaseId);
    }
  }, [releaseId, fetchTasksByRelease]);

  const { getFilesByRelease, files } = useFileStore();
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Health Score */}
            <Card className="lg:col-span-2" padding="lg">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-content-primary">Release Health</h2>
                  <p className="text-sm text-content-secondary">Track your release progress</p>
                </div>
                <CircularProgress value={healthScore} size={80} strokeWidth={8}>
                  <span className="text-xl font-bold text-content-primary">{healthScore}%</span>
                </CircularProgress>
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

            {/* Next Steps */}
            <Card className="lg:col-span-3" padding="lg">
              <h3 className="font-semibold text-content-primary mb-4">Next Steps</h3>
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
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'tasks' && (
          <TaskList releaseId={releaseId} />
        )}

      </main>
    </div>
  );
}
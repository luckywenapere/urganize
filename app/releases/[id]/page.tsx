'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useReleaseStore } from '@/lib/release-store';
import { useTaskStore } from '@/lib/task-store';
import { useFileStore, hasRequiredAudioFile } from '@/lib/file-store';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TaskList } from '@/components/tasks/TaskList';
import { FileUpload } from '@/components/files/FileUpload';
import { ArrowLeft, Music, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

type Tab = 'overview' | 'tasks' | 'files';

export default function ReleaseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const releaseId = params.id as string;

  const { releases } = useReleaseStore();
  const { getTasksByRelease } = useTaskStore();
  const { getFilesByRelease, files } = useFileStore();

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const release = releases.find((r) => r.id === releaseId);

  useEffect(() => {
    if (!release) {
      router.push('/dashboard');
    }
  }, [release, router]);

  if (!release) {
    return null;
  }

  const tasks = getTasksByRelease(releaseId);
  const releaseFiles = getFilesByRelease(releaseId);
  const hasAudio = hasRequiredAudioFile(releaseId, files);
  
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const healthScore = Math.round((completedTasks.length / tasks.length) * 100);

  const warnings = [];
  if (!hasAudio) warnings.push('Missing required audio file');
  if (!release.releaseDate) warnings.push('Release date not set');
  if (releaseFiles.filter(f => f.category === 'artwork').length === 0) {
    warnings.push('No artwork uploaded');
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex items-start gap-6">
              {/* Cover Art */}
              <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-emerald-600/20 to-blue-600/20 flex items-center justify-center">
                {release.coverArt ? (
                  <img
                    src={release.coverArt}
                    alt={release.title}
                    className="w-full h-full object-cover rounded-xl"
                  />
                ) : (
                  <Music className="w-10 h-10 text-slate-600" />
                )}
              </div>

              {/* Release Info */}
              <div>
                <h1 className="text-3xl font-bold font-display mb-2">{release.title}</h1>
                <p className="text-slate-400 mb-3">{release.artistName}</p>
                <div className="flex items-center gap-3">
                  <StatusBadge status={release.status} />
                  {release.releaseDate && (
                    <div className="flex items-center gap-1.5 text-sm text-slate-400">
                      <Calendar className="w-4 h-4" />
                      {formatDistanceToNow(new Date(release.releaseDate), {
                        addSuffix: true,
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button variant="secondary">Settings</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-6 border-b border-slate-800">
            {(['overview', 'tasks', 'files'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 font-medium capitalize transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Release Health */}
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
              <h2 className="text-xl font-bold mb-4">Release Health</h2>
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-400">Overall Progress</span>
                <span className="font-bold">{healthScore}%</span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${healthScore}%` }}
                />
              </div>
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20">
                <h2 className="text-xl font-bold mb-4 text-red-400">Missing Items</h2>
                <div className="space-y-2">
                  {warnings.map((warning, index) => (
                    <div key={index} className="flex items-center gap-2 text-red-400">
                      <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                      {warning}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Up */}
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
              <h2 className="text-xl font-bold mb-4">Next Up</h2>
              {pendingTasks.length === 0 ? (
                <p className="text-slate-400">All tasks completed! 🎉</p>
              ) : (
                <div className="space-y-2">
                  {pendingTasks.slice(0, 5).map((task, index) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50"
                    >
                      <span className="text-slate-500 font-mono text-sm">{index + 1}.</span>
                      <span className="flex-1">{task.title}</span>
                      {task.dueDate && (
                        <span className="text-xs text-slate-500">
                          {formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <Button
                onClick={() => setActiveTab('tasks')}
                variant="ghost"
                className="w-full mt-4"
              >
                View All Tasks
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
                <div className="text-3xl font-bold mb-1">{pendingTasks.length}</div>
                <div className="text-slate-400">Tasks Remaining</div>
              </div>
              <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
                <div className="text-3xl font-bold mb-1">{releaseFiles.length}</div>
                <div className="text-slate-400">Files Uploaded</div>
              </div>
              <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
                <div className="text-3xl font-bold mb-1 text-emerald-400">
                  {completedTasks.length}
                </div>
                <div className="text-slate-400">Tasks Completed</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Tasks</h2>
              <p className="text-slate-400">
                {pendingTasks.length} remaining of {tasks.length} total
              </p>
            </div>
            <TaskList releaseId={releaseId} />
          </div>
        )}

        {activeTab === 'files' && (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Files</h2>
              <p className="text-slate-400">{releaseFiles.length} files uploaded</p>
            </div>
            <FileUpload releaseId={releaseId} />
          </div>
        )}
      </main>
    </div>
  );
}

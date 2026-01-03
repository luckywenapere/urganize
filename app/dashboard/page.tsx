'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/lib/release-store';
import { useTaskStore } from '@/lib/task-store';
import { Button } from '@/components/ui/Button';
import { ReleaseCard } from '@/components/releases/ReleaseCard';
import { Plus, Music, LogOut } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { releases } = useReleaseStore();
  const { getTasksByRelease } = useTaskStore();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
    }
  }, [isAuthenticated, router]);

  const handleLogout = () => {
    logout();
    router.push('/auth');
  };

  const handleCreateRelease = () => {
    router.push('/releases/create');
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  // Get active releases (not released yet)
  const activeReleases = releases.filter(r => r.status !== 'released');
  
  // Get pending tasks across all releases
  const allTasks = releases.flatMap(r => getTasksByRelease(r.id));
  const pendingTasks = allTasks.filter(t => t.status === 'pending');
  const urgentTasks = pendingTasks.filter(t => {
    if (!t.dueDate) return false;
    const daysUntilDue = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntilDue <= 3;
  });

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <Music className="w-6 h-6 text-emerald-500" />
              <span className="font-bold text-xl font-display">Urganize</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link href="/dashboard" className="text-emerald-400 font-medium">
                Releases
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:block text-right">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-slate-400">{user.role === 'artist-manager' ? 'Manager' : 'Artist'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold font-display mb-2">
            Welcome back, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400">
            {activeReleases.length === 0 
              ? "Ready to create your first release?" 
              : `You have ${activeReleases.length} active ${activeReleases.length === 1 ? 'release' : 'releases'}`
            }
          </p>
        </div>

        {/* Urgent Items */}
        {urgentTasks.length > 0 && (
          <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Urgent Items ({urgentTasks.length})
            </h2>
            <div className="space-y-2">
              {urgentTasks.slice(0, 5).map((task) => {
                const release = releases.find(r => r.id === task.releaseId);
                const daysUntilDue = Math.ceil((new Date(task.dueDate!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                
                return (
                  <Link
                    key={task.id}
                    href={`/releases/${task.releaseId}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="text-sm text-slate-400">{release?.title}</p>
                      </div>
                    </div>
                    <span className="text-sm text-red-400">
                      {daysUntilDue === 0 ? 'Today' : daysUntilDue < 0 ? 'Overdue' : `${daysUntilDue}d`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Releases */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold font-display">
              Active Releases ({activeReleases.length})
            </h2>
            <Button onClick={handleCreateRelease} className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              New Release
            </Button>
          </div>

          {activeReleases.length === 0 ? (
            <div className="text-center py-16 px-6 rounded-2xl border-2 border-dashed border-slate-800">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                <Music className="w-8 h-8 text-slate-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No releases yet</h3>
              <p className="text-slate-400 mb-6 max-w-md mx-auto">
                Create your first release to get started. We'll help you organize everything from tasks to files.
              </p>
              <Button onClick={handleCreateRelease} size="lg" className="flex items-center gap-2 mx-auto">
                <Plus className="w-5 h-5" />
                Create Your First Release
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeReleases.map((release) => {
                const tasksForRelease = getTasksByRelease(release.id);
                const pendingCount = tasksForRelease.filter(t => t.status === 'pending').length;
                
                return (
                  <ReleaseCard
                    key={release.id}
                    release={release}
                    taskCount={pendingCount}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
            <div className="text-3xl font-bold mb-1">{releases.length}</div>
            <div className="text-slate-400">Total Releases</div>
          </div>
          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
            <div className="text-3xl font-bold mb-1">{pendingTasks.length}</div>
            <div className="text-slate-400">Pending Tasks</div>
          </div>
          <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800">
            <div className="text-3xl font-bold mb-1 text-emerald-400">
              {allTasks.filter(t => t.status === 'completed').length}
            </div>
            <div className="text-slate-400">Completed Tasks</div>
          </div>
        </div>
      </main>
    </div>
  );
}

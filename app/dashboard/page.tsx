'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/lib/release-store';
import { useTaskStore } from '@/lib/task-store';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ReleaseCard } from '@/components/releases/ReleaseCard';
import { Logo } from '@/components/ui/Logo';
import { RoleBadge, CountBadge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/Progress';
import { 
  Plus, 
  Search, 
  Bell, 
  Settings,
  ChevronRight,
  Zap,
  Calendar,
  FolderOpen,
  Users,
  BarChart3,
  Command
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { releases } = useReleaseStore();
  const { getTasksByRelease } = useTaskStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated) {
      router.push('/auth');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user || !mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-brand border-t-transparent rounded-full" />
      </div>
    );
  }

  // Data calculations
  const activeReleases = releases.filter(r => r.status !== 'released');
  const allTasks = releases.flatMap(r => getTasksByRelease(r.id));
  const pendingTasks = allTasks.filter(t => t.status === 'pending');
  const completedTasks = allTasks.filter(t => t.status === 'completed');
  
  const urgentTasks = pendingTasks.filter(t => {
    if (!t.dueDate) return false;
    const daysUntilDue = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return daysUntilDue <= 3 && daysUntilDue >= 0;
  });

  const firstName = user.name.split(' ')[0];
  const userRole = user.role === 'artist-manager' ? 'manager' : 'artist';
  const overallProgress = allTasks.length > 0 
    ? Math.round((completedTasks.length / allTasks.length) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-bg-base">
      {/* ===== HEADER - Linear style ===== */}
      <header className="sticky top-0 z-50 glass border-b border-stroke-subtle">
        <div className="h-14 px-4 flex items-center justify-between max-w-[1600px] mx-auto">
          {/* Left: Logo & Nav */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="hover:opacity-80 transition-opacity">
              <Logo size="md" />
            </Link>
            
            <nav className="hidden md:flex items-center gap-1">
              <Link 
                href="/dashboard" 
                className="h-8 px-3 flex items-center text-sm font-medium text-content-primary bg-bg-hover rounded-md"
              >
                Releases
              </Link>
              <Link 
                href="/dashboard" 
                className="h-8 px-3 flex items-center text-sm font-medium text-content-tertiary hover:text-content-primary hover:bg-bg-hover rounded-md transition-colors"
              >
                Calendar
              </Link>
              <Link 
                href="/dashboard" 
                className="h-8 px-3 flex items-center text-sm font-medium text-content-tertiary hover:text-content-primary hover:bg-bg-hover rounded-md transition-colors"
              >
                People
              </Link>
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Search - Linear style */}
            <button className="hidden md:flex items-center gap-2 h-8 px-3 text-sm text-content-tertiary bg-bg-elevated border border-stroke-subtle rounded-md hover:border-stroke-default transition-colors">
              <Search className="w-4 h-4" />
              <span>Search...</span>
              <div className="flex items-center gap-0.5 ml-2">
                <kbd className="kbd">⌘</kbd>
                <kbd className="kbd">K</kbd>
              </div>
            </button>

            {/* Notifications */}
            <div className="relative">
              <IconButton tooltip="Notifications">
                <Bell className="w-[18px] h-[18px]" />
              </IconButton>
              {urgentTasks.length > 0 && (
                <CountBadge 
                  count={urgentTasks.length} 
                  variant="error"
                  className="absolute -top-1 -right-1"
                />
              )}
            </div>

            {/* Settings */}
            <IconButton tooltip="Settings">
              <Settings className="w-[18px] h-[18px]" />
            </IconButton>

            {/* User */}
            <div className="flex items-center gap-3 ml-2 pl-3 border-l border-stroke-subtle">
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-content-primary leading-tight">{user.name}</p>
                <RoleBadge role={userRole} size="sm" />
              </div>
              <button 
                onClick={() => { logout(); router.push('/auth'); }}
                className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-content-secondary hover:text-content-primary transition-colors"
              >
                <span className="text-sm font-semibold">{firstName[0]}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <main className="max-w-[1600px] mx-auto px-4 py-6">
        {/* Welcome Section */}
        <section className="mb-8 animate-in">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-semibold text-content-primary mb-1">
                Welcome back, {firstName}
              </h1>
              <p className="text-content-secondary">
                {activeReleases.length === 0 
                  ? "Ready to create your first release?" 
                  : `You have ${activeReleases.length} active ${activeReleases.length === 1 ? 'release' : 'releases'}`
                }
              </p>
            </div>
            
            <Button 
              onClick={() => router.push('/releases/create')}
              leftIcon={<Plus className="w-4 h-4" />}
              kbd="C"
            >
              New Release
            </Button>
          </div>
        </section>

        {/* Urgent Tasks Alert */}
        {urgentTasks.length > 0 && (
          <section className="mb-6 animate-in delay-1">
            <Card 
              className="border-status-warning/30 bg-status-warning/5"
              padding="sm"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-status-warning/20 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-status-warning" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-status-warning">
                    {urgentTasks.length} urgent {urgentTasks.length === 1 ? 'task' : 'tasks'}
                  </h3>
                  <p className="text-sm text-content-secondary truncate">
                    {urgentTasks.slice(0, 2).map(t => t.title).join(', ')}
                    {urgentTasks.length > 2 && ` +${urgentTasks.length - 2} more`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" rightIcon={<ChevronRight className="w-4 h-4" />}>
                  View
                </Button>
              </div>
            </Card>
          </section>
        )}

        {/* Stats Row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Releases', value: activeReleases.length, icon: FolderOpen, color: 'text-brand' },
            { label: 'Pending Tasks', value: pendingTasks.length, icon: Calendar, color: 'text-status-warning' },
            { label: 'Completed', value: completedTasks.length, icon: BarChart3, color: 'text-status-success' },
            { label: 'Overall Progress', value: `${overallProgress}%`, icon: Zap, color: 'text-brand', isProgress: true },
          ].map((stat, i) => (
            <Card 
              key={stat.label} 
              className={`animate-in delay-${i + 2}`}
              padding="sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-content-tertiary mb-1">{stat.label}</p>
                  <p className={`text-2xl font-bold tabular-nums ${stat.color}`}>
                    {stat.value}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                  <stat.icon className={`w-[18px] h-[18px] ${stat.color}`} />
                </div>
              </div>
              {stat.isProgress && (
                <ProgressBar value={overallProgress} size="sm" className="mt-3" />
              )}
            </Card>
          ))}
        </section>

        {/* Active Releases */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-content-primary">
              Active Releases
            </h2>
            {activeReleases.length > 0 && (
              <Button variant="ghost" size="sm" rightIcon={<ChevronRight className="w-4 h-4" />}>
                View all
              </Button>
            )}
          </div>

          {activeReleases.length === 0 ? (
            <Card className="animate-in delay-3" padding="lg">
              <div className="text-center py-8">
                <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-bg-elevated flex items-center justify-center">
                  <FolderOpen className="w-7 h-7 text-content-tertiary" />
                </div>
                <h3 className="text-lg font-semibold text-content-primary mb-2">
                  No releases yet
                </h3>
                <p className="text-content-secondary mb-6 max-w-md mx-auto">
                  Create your first release to get started. We'll automatically set up tasks, folders, and timelines.
                </p>
                <Button 
                  onClick={() => router.push('/releases/create')}
                  leftIcon={<Plus className="w-4 h-4" />}
                >
                  Create Your First Release
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeReleases.map((release, i) => {
                const tasks = getTasksByRelease(release.id);
                const pendingCount = tasks.filter(t => t.status === 'pending').length;
                
                return (
                  <div 
                    key={release.id}
                    className={`animate-in delay-${Math.min(i + 3, 8)}`}
                  >
                    <ReleaseCard
                      release={release}
                      pendingTasks={pendingCount}
                      totalTasks={tasks.length}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Quick Actions */}
        {activeReleases.length > 0 && (
          <section className="animate-in delay-6">
            <h2 className="text-lg font-semibold text-content-primary mb-4">
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: Plus, label: 'Create Task', kbd: 'T' },
                { icon: FolderOpen, label: 'Upload Files', kbd: 'U' },
                { icon: Users, label: 'Add Person', kbd: 'P' },
                { icon: BarChart3, label: 'View Reports', kbd: 'R' },
              ].map((action) => (
                <button
                  key={action.label}
                  className="card card-interactive p-4 text-left group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center card-icon transition-all duration-fast">
                      <action.icon className="w-[18px] h-[18px] text-content-secondary" />
                    </div>
                    <kbd className="kbd opacity-0 group-hover:opacity-100 transition-opacity">
                      {action.kbd}
                    </kbd>
                  </div>
                  <span className="text-sm font-medium text-content-primary">
                    {action.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

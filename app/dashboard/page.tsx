'use client';

import { useEffect, useState, useRef } from 'react';
import { UpgradeButton } from '@/components/UpgradeButton';
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
  ChevronDown,
  Zap,
  Calendar,
  FolderOpen,
  Users,
  BarChart3,
  Command,
  LogOut,
  Music,
  ListTodo,
  X
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { releases, fetchReleases } = useReleaseStore();
  const { getTasksByRelease } = useTaskStore();
  const [mounted, setMounted] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated) {
      router.push('/auth');
    } else if (isAuthenticated && user && !user.is_subscribed) {
      // Paywall: redirect to pricing if not subscribed
      router.push('/pricing?from=dashboard');
    }
  }, [isAuthenticated, user, router]);
  
  useEffect(() => {
    if (isAuthenticated && user) {
      fetchReleases();
    }
  }, [isAuthenticated, user, fetchReleases]);

  // Keyboard shortcut for search (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus search input when modal opens
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

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

  // Search filtering
  const searchLower = searchQuery.toLowerCase().trim();
  
  const filteredReleases = releases.filter(r => 
    r.title.toLowerCase().includes(searchLower) ||
    r.artistName.toLowerCase().includes(searchLower)
  );

  const filteredTasks = allTasks.filter(t =>
    t.title.toLowerCase().includes(searchLower)
  );

  // Search result actions
  const handleSelectRelease = (releaseId: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    router.push(`/releases/${releaseId}`);
  };

  const handleSelectTask = (releaseId: string) => {
    setSearchOpen(false);
    setSearchQuery('');
    router.push(`/releases/${releaseId}?tab=tasks`);
  };

  return (
    <div className="min-h-screen bg-bg-base">
      {/* ===== SEARCH MODAL (Command Palette) ===== */}
      {searchOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
          />
          
          {/* Modal */}
          <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-xl z-50 px-4 animate-in">
            <div className="bg-bg-surface border border-stroke-subtle rounded-xl shadow-2xl overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-stroke-subtle">
                <Search className="w-5 h-5 text-content-tertiary flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search releases, tasks..."
                  className="flex-1 bg-transparent text-content-primary placeholder:text-content-tertiary outline-none text-base"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="p-1 hover:bg-bg-hover rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-content-tertiary" />
                  </button>
                )}
                <kbd className="kbd">ESC</kbd>
              </div>

              {/* Search Results */}
              <div className="max-h-[400px] overflow-y-auto">
                {searchQuery.length === 0 ? (
                  // Default state - show recent/suggestions
                  <div className="p-4">
                    <p className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-3">
                      Quick Actions
                    </p>
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          setSearchOpen(false);
                          if (!user.is_subscribed) {
                            router.push('/pricing');
                          } else {
                            router.push('/releases/create');
                          }
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                          <Plus className="w-4 h-4 text-brand" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-content-primary">Create New Release</p>
                          <p className="text-xs text-content-tertiary">Start a new music release</p>
                        </div>
                      </button>
                    </div>

                    {activeReleases.length > 0 && (
                      <>
                        <p className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-3 mt-6">
                          Recent Releases
                        </p>
                        <div className="space-y-1">
                          {activeReleases.slice(0, 3).map(release => (
                            <button
                              key={release.id}
                              onClick={() => handleSelectRelease(release.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors text-left"
                            >
                              <div className="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center">
                                <Music className="w-4 h-4 text-content-secondary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-content-primary">{release.title}</p>
                                <p className="text-xs text-content-tertiary">{release.artistName}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  // Search results
                  <div className="p-4">
                    {/* Releases Results */}
                    {filteredReleases.length > 0 && (
                      <>
                        <p className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-3">
                          Releases ({filteredReleases.length})
                        </p>
                        <div className="space-y-1 mb-4">
                          {filteredReleases.slice(0, 5).map(release => (
                            <button
                              key={release.id}
                              onClick={() => handleSelectRelease(release.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors text-left"
                            >
                              <div className="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center">
                                <Music className="w-4 h-4 text-content-secondary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-content-primary truncate">{release.title}</p>
                                <p className="text-xs text-content-tertiary truncate">{release.artistName}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-content-tertiary" />
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Tasks Results */}
                    {filteredTasks.length > 0 && (
                      <>
                        <p className="text-xs font-medium text-content-tertiary uppercase tracking-wider mb-3">
                          Tasks ({filteredTasks.length})
                        </p>
                        <div className="space-y-1">
                          {filteredTasks.slice(0, 5).map(task => {
                            const release = releases.find(r => r.id === task.releaseId);
                            return (
                              <button
                                key={task.id}
                                onClick={() => handleSelectTask(task.releaseId)}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-bg-hover transition-colors text-left"
                              >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  task.status === 'completed' ? 'bg-brand/20' : 'bg-bg-elevated'
                                }`}>
                                  <ListTodo className={`w-4 h-4 ${
                                    task.status === 'completed' ? 'text-brand' : 'text-content-secondary'
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium truncate ${
                                    task.status === 'completed' ? 'text-content-tertiary line-through' : 'text-content-primary'
                                  }`}>
                                    {task.title}
                                  </p>
                                  <p className="text-xs text-content-tertiary truncate">
                                    {release?.title || 'Unknown release'}
                                  </p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-content-tertiary" />
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {/* No results */}
                    {filteredReleases.length === 0 && filteredTasks.length === 0 && (
                      <div className="text-center py-8">
                        <Search className="w-10 h-10 text-content-tertiary mx-auto mb-3" />
                        <p className="text-content-secondary">No results found for &quot;{searchQuery}&quot;</p>
                        <p className="text-sm text-content-tertiary mt-1">Try a different search term</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-stroke-subtle flex items-center justify-between text-xs text-content-tertiary">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <kbd className="kbd">↑</kbd>
                    <kbd className="kbd">↓</kbd>
                    to navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="kbd">↵</kbd>
                    to select
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <kbd className="kbd">ESC</kbd>
                  to close
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== HEADER - Linear style ===== */}
      <header className="sticky top-0 z-40 glass border-b border-stroke-subtle">
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
            {/* Search - Linear style (now clickable) */}
            <button 
              onClick={() => setSearchOpen(true)}
              className="hidden md:flex items-center gap-2 h-8 px-3 text-sm text-content-tertiary bg-bg-elevated border border-stroke-subtle rounded-md hover:border-stroke-default hover:text-content-secondary transition-colors"
            >
              <Search className="w-4 h-4" />
              <span>Search...</span>
              <div className="flex items-center gap-0.5 ml-2">
                <kbd className="kbd">⌘</kbd>
                <kbd className="kbd">K</kbd>
              </div>
            </button>

            {/* Mobile search button */}
            <IconButton 
              tooltip="Search"
              onClick={() => setSearchOpen(true)}
              className="md:hidden"
            >
              <Search className="w-[18px] h-[18px]" />
            </IconButton>

            {/* Upgrade Button */}
            <UpgradeButton isSubscribed={user.is_subscribed ?? false} />

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

            {/* User Menu with Dropdown */}
            <div className="relative ml-2 pl-3 border-l border-stroke-subtle">
              <button 
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-bg-hover transition-colors"
              >
                <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center">
                  <span className="text-xs font-semibold text-white">{firstName[0]}</span>
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-content-primary leading-tight">{user.name}</p>
                  <RoleBadge role={userRole} size="sm" />
                </div>
                <ChevronDown className={`w-4 h-4 text-content-tertiary hidden md:block transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <>
                  {/* Backdrop to close menu when clicking outside */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setUserMenuOpen(false)} 
                  />
                  
                  {/* Menu */}
                  <div className="absolute right-0 top-full mt-2 w-56 py-2 bg-bg-surface border border-stroke-subtle rounded-lg shadow-xl z-50 animate-in">
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-stroke-subtle">
                      <p className="text-sm font-medium text-content-primary">{user.name}</p>
                      <p className="text-xs text-content-tertiary mt-0.5">{user.email}</p>
                      <div className="mt-2">
                        <RoleBadge role={userRole} size="sm" />
                      </div>
                    </div>
                    
                    {/* Menu Items */}
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          // Navigate to settings when implemented
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:text-content-primary hover:bg-bg-hover transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </button>
                    </div>

                    {/* Sign Out */}
                    <div className="border-t border-stroke-subtle pt-1">
                      <button
                        onClick={() => { 
                          setUserMenuOpen(false);
                          logout(); 
                          router.push('/auth'); 
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign out
                      </button>
                    </div>
                  </div>
                </>
              )}
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
              onClick={() => {
                if (!user.is_subscribed) {
                  router.push('/pricing');
                } else {
                  router.push('/releases/create');
                }
              }}
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
            <Card className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-bg-elevated flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="w-8 h-8 text-content-tertiary" />
              </div>
              <h3 className="text-lg font-semibold text-content-primary mb-2">
                No active releases
              </h3>
              <p className="text-content-secondary max-w-sm mx-auto mb-6">
                Create your first release to get started. 
                We&apos;ll automatically set up tasks, folders, and timelines.
              </p>
              <Button 
                onClick={() => {
                  if (!user.is_subscribed) {
                    router.push('/pricing');
                  } else {
                    router.push('/releases/create');
                  }
                }}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Create Your First Release
              </Button>
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

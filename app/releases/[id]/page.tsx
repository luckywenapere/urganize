// app/dashboard/page.tsx
// Updated with AI Campaign highlights
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/lib/release-store';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { ReleaseCard } from '@/components/releases/ReleaseCard';
import { 
  Plus, 
  FolderOpen, 
  Bell, 
  Search,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuthStore();
  const { releases, isLoading: releasesLoading, fetchReleases } = useReleaseStore();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch releases on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchReleases();
    }
  }, [isAuthenticated, fetchReleases]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth');
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  // Filter releases by search
  const filteredReleases = releases.filter(release =>
    release.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    release.artistName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get active releases (not released)
  const activeReleases = filteredReleases.filter(r => r.status !== 'released');
  const completedReleases = filteredReleases.filter(r => r.status === 'released');

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg-surface/80 backdrop-blur-md border-b border-stroke-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Logo />
            
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                <input
                  type="text"
                  placeholder="Search releases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-bg-elevated border border-stroke-subtle rounded-lg text-sm text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand w-64"
                />
              </div>
              
              <IconButton variant="ghost" size="sm">
                <Bell className="w-5 h-5" />
              </IconButton>
              
              {/* User Menu */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-content-primary">{user?.name}</p>
                  <p className="text-xs text-content-tertiary capitalize">{user?.role}</p>
                </div>
                <button
                  onClick={logout}
                  className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand font-medium text-sm"
                >
                  {user?.name?.charAt(0).toUpperCase()}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-content-primary">
              Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-content-secondary mt-1">
              {activeReleases.length === 0 
                ? "Let's get your first release started"
                : `You have ${activeReleases.length} active release${activeReleases.length !== 1 ? 's' : ''}`
              }
            </p>
          </div>
          
          <Button onClick={() => router.push('/releases/create')}>
            <Plus className="w-4 h-4 mr-2" />
            New Release
          </Button>
        </div>

        {/* Quick Stats (shown when user has releases) */}
        {releases.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <Card padding="md" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-brand" />
              </div>
              <div>
                <p className="text-2xl font-bold text-content-primary">{activeReleases.length}</p>
                <p className="text-xs text-content-tertiary">Active Releases</p>
              </div>
            </Card>
            
            <Card padding="md" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-content-primary">{completedReleases.length}</p>
                <p className="text-xs text-content-tertiary">Released</p>
              </div>
            </Card>
            
            <Card padding="md" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-content-primary">AI</p>
                <p className="text-xs text-content-tertiary">Powered Tasks</p>
              </div>
            </Card>
            
            <Card padding="md" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-content-primary">24/7</p>
                <p className="text-xs text-content-tertiary">Always Ready</p>
              </div>
            </Card>
          </div>
        )}

        {/* Mobile Search */}
        <div className="sm:hidden mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
            <input
              type="text"
              placeholder="Search releases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-3 bg-bg-elevated border border-stroke-subtle rounded-xl text-content-primary placeholder:text-content-tertiary focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        {/* Releases Grid */}
        {releasesLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand/30 border-t-brand rounded-full animate-spin" />
          </div>
        ) : releases.length === 0 ? (
          /* Empty State */
          <Card className="text-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-bg-elevated flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="w-10 h-10 text-content-tertiary" />
            </div>
            <h3 className="text-xl font-semibold text-content-primary mb-2">
              No releases yet
            </h3>
            <p className="text-content-secondary max-w-md mx-auto mb-8">
              Create your first release to get started. Our AI will help you build 
              a personalized marketing campaign.
            </p>
            
            <Button onClick={() => router.push('/releases/create')} size="lg">
              <Sparkles className="w-5 h-5 mr-2" />
              Create Your First Release
            </Button>
            
            {/* Feature highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 max-w-2xl mx-auto">
              <div className="p-4 rounded-xl bg-bg-elevated text-left">
                <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center mb-3">
                  <Sparkles className="w-4 h-4 text-brand" />
                </div>
                <h4 className="font-medium text-content-primary text-sm">AI-Powered Tasks</h4>
                <p className="text-xs text-content-tertiary mt-1">
                  Get personalized marketing tasks tailored to your release
                </p>
              </div>
              <div className="p-4 rounded-xl bg-bg-elevated text-left">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                </div>
                <h4 className="font-medium text-content-primary text-sm">One Task at a Time</h4>
                <p className="text-xs text-content-tertiary mt-1">
                  Focus on what matters without feeling overwhelmed
                </p>
              </div>
              <div className="p-4 rounded-xl bg-bg-elevated text-left">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center mb-3">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                </div>
                <h4 className="font-medium text-content-primary text-sm">Track Progress</h4>
                <p className="text-xs text-content-tertiary mt-1">
                  See your campaign progress across all platforms
                </p>
              </div>
            </div>
          </Card>
        ) : filteredReleases.length === 0 ? (
          /* No search results */
          <Card className="text-center py-12">
            <p className="text-content-secondary">
              No releases found for &quot;{searchQuery}&quot;
            </p>
          </Card>
        ) : (
          /* Releases List */
          <div className="space-y-8">
            {/* Active Releases */}
            {activeReleases.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-brand" />
                  Active Releases
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeReleases.map((release) => (
                    <Link key={release.id} href={`/releases/${release.id}`}>
                      <ReleaseCard release={release} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Releases */}
            {completedReleases.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  Released
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {completedReleases.map((release) => (
                    <Link key={release.id} href={`/releases/${release.id}`}>
                      <ReleaseCard release={release} />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useReleaseStore } from '@/lib/release-store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Logo } from '@/components/ui/Logo';
import { 
  Plus, Sparkles, Calendar, Music, Settings,
  ChevronRight, ArrowRight, Rocket, Clock
} from 'lucide-react';
import { differenceInDays } from 'date-fns';

export default function DashboardPage() {
  const router = useRouter();
  const { releases, fetchReleases } = useReleaseStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadReleases = async () => {
      setIsLoading(false);
      await fetchReleases();
    };
    loadReleases();
  }, [fetchReleases]);

  const sortedReleases = [...releases].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const upcomingReleases = sortedReleases.filter(r => 
    r.releaseDate && new Date(r.releaseDate) > new Date()
  );

  const recentReleases = sortedReleases.filter(r => 
    r.releaseDate && new Date(r.releaseDate) <= new Date()
  );

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-bg-surface/80 backdrop-blur-md border-b border-stroke-subtle">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Logo size="sm" />
              <div>
                <h1 className="font-semibold text-content-primary">Dashboard</h1>
                <p className="text-xs text-content-tertiary">Manage your releases</p>
              </div>
            </div>
            
            <Button onClick={() => router.push('/releases/create')}>
              <Plus className="w-4 h-4 mr-2" />
              New Release
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-brand/20 border-t-brand rounded-full animate-spin" />
          </div>
        ) : releases.length === 0 ? (
          // Empty State
          <div className="text-center py-16">
            <Music className="w-16 h-16 text-brand/40 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-content-primary mb-2">No releases yet</h2>
            <p className="text-content-secondary mb-8">
              Create your first release to get started with Urganize
            </p>
            <Button size="lg" onClick={() => router.push('/releases/create')}>
              <Rocket className="w-5 h-5 mr-2" />
              Create Release
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Upcoming Releases */}
            {upcomingReleases.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-brand" />
                  Upcoming Releases
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcomingReleases.map((release) => {
                    const daysUntil = release.releaseDate 
                      ? differenceInDays(new Date(release.releaseDate), new Date())
                      : null;

                    return (
                      <Link key={release.id} href={`/releases/${release.id}`}>
                        <Card 
                          padding="lg" 
                          className="h-full hover:border-brand/50 hover:bg-bg-hover transition-all cursor-pointer group"
                        >
                          <div className="flex flex-col h-full">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h3 className="font-semibold text-content-primary group-hover:text-brand transition-colors">
                                  {release.title}
                                </h3>
                                <p className="text-sm text-content-secondary">{release.artistName}</p>
                              </div>
                              <StatusBadge status={release.status} />
                            </div>

                            {daysUntil !== null && (
                              <div className="flex items-center gap-2 text-sm text-brand font-medium mb-4 px-3 py-1.5 bg-brand/10 rounded-lg w-fit">
                                <Calendar className="w-4 h-4" />
                                {daysUntil} days
                              </div>
                            )}

                            <div className="flex-1" />

                            <div className="flex items-center justify-between text-sm">
                              <span className="text-content-tertiary capitalize">{release.type}</span>
                              <ChevronRight className="w-4 h-4 text-content-tertiary group-hover:text-brand transition-colors" />
                            </div>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Recent/Released */}
            {recentReleases.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-content-primary mb-4 flex items-center gap-2">
                  <Music className="w-5 h-5 text-purple-400" />
                  Released
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentReleases.map((release) => (
                    <Link key={release.id} href={`/releases/${release.id}`}>
                      <Card 
                        padding="lg" 
                        className="h-full hover:border-brand/50 hover:bg-bg-hover transition-all cursor-pointer group opacity-75"
                      >
                        <div className="flex flex-col h-full">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h3 className="font-semibold text-content-primary group-hover:text-brand transition-colors">
                                {release.title}
                              </h3>
                              <p className="text-sm text-content-secondary">{release.artistName}</p>
                            </div>
                            <StatusBadge status={release.status} />
                          </div>

                          {release.releaseDate && (
                            <div className="text-xs text-content-tertiary mb-4">
                              Released {new Date(release.releaseDate).toLocaleDateString()}
                            </div>
                          )}

                          <div className="flex-1" />

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-content-tertiary capitalize">{release.type}</span>
                            <ChevronRight className="w-4 h-4 text-content-tertiary group-hover:text-brand transition-colors" />
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

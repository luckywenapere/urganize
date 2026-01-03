import React from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { Release } from '@/types';
import { formatDistanceToNow } from 'date-fns';

interface ReleaseCardProps {
  release: Release;
  taskCount?: number;
}

export const ReleaseCard: React.FC<ReleaseCardProps> = ({ release, taskCount = 0 }) => {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/releases/${release.id}`);
  };

  const getReleaseHealth = () => {
    // Simple health calculation - can be enhanced
    if (release.status === 'released') return 100;
    if (release.status === 'ready') return 90;
    if (release.status === 'in-progress') return 50;
    return 20;
  };

  const health = getReleaseHealth();

  return (
    <Card onClick={handleClick} className="hover:scale-[1.02] transition-transform">
      <div className="space-y-4">
        {/* Cover Art Placeholder */}
        <div className="aspect-square rounded-xl bg-gradient-to-br from-emerald-600/20 to-blue-600/20 flex items-center justify-center overflow-hidden">
          {release.coverArt ? (
            <img src={release.coverArt} alt={release.title} className="w-full h-full object-cover" />
          ) : (
            <div className="text-center text-slate-600">
              <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <span className="text-sm">No artwork yet</span>
            </div>
          )}
        </div>

        {/* Release Info */}
        <div>
          <h3 className="font-bold text-lg mb-1 truncate">{release.title}</h3>
          <p className="text-sm text-slate-400 mb-2">{release.artistName}</p>
          <StatusBadge status={release.status} size="sm" />
        </div>

        {/* Health Bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Release Health</span>
            <span>{health}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${health}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="flex justify-between text-sm text-slate-400 pt-2 border-t border-slate-800">
          <span>{taskCount} tasks remaining</span>
          {release.releaseDate && (
            <span className="text-emerald-400">
              {formatDistanceToNow(new Date(release.releaseDate), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
};

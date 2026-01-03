'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/Progress';
import type { Release } from '@/types';
import { Music, Calendar } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface ReleaseCardProps {
  release: Release;
  pendingTasks?: number;
  totalTasks?: number;
  className?: string;
}

export const ReleaseCard: React.FC<ReleaseCardProps> = ({ 
  release, 
  pendingTasks = 0,
  totalTasks = 16,
  className = ''
}) => {
  const router = useRouter();
  
  const completedTasks = totalTasks - pendingTasks;
  const healthScore = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const getDueInfo = () => {
    if (!release.releaseDate) return null;
    const days = differenceInDays(new Date(release.releaseDate), new Date());
    
    if (days < 0) return { text: `${Math.abs(days)}d ago`, urgent: true };
    if (days === 0) return { text: 'Today', urgent: true };
    if (days <= 7) return { text: `${days}d`, urgent: true };
    return { text: `${days}d`, urgent: false };
  };

  const dueInfo = getDueInfo();

  return (
    <Card 
      variant="interactive"
      padding="none"
      onClick={() => router.push(`/releases/${release.id}`)}
      className={`overflow-hidden group ${className}`}
    >
      {/* Cover Art Area */}
      <div className="aspect-square relative bg-bg-elevated overflow-hidden">
        {release.coverArt ? (
          <img 
            src={release.coverArt} 
            alt={release.title}
            className="w-full h-full object-cover transition-transform duration-slow group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Subtle grid pattern */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                               linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '20px 20px'
            }} />
            
            {/* Music icon */}
            <div className="w-16 h-16 rounded-xl bg-bg-overlay border border-stroke-subtle flex items-center justify-center transition-transform duration-normal group-hover:scale-110">
              <Music className="w-8 h-8 text-content-quaternary" />
            </div>
          </div>
        )}
        
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-bg-base/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-normal" />
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title & Artist */}
        <div className="mb-3">
          <h3 className="font-semibold text-content-primary truncate group-hover:text-brand transition-colors duration-fast">
            {release.title}
          </h3>
          <p className="text-sm text-content-tertiary truncate">{release.artistName}</p>
        </div>

        {/* Status */}
        <div className="mb-3">
          <StatusBadge status={release.status} size="sm" />
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-content-tertiary">Release Health</span>
            <span className="font-semibold text-content-secondary tabular-nums">{healthScore}%</span>
          </div>
          <ProgressBar value={healthScore} size="sm" />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-content-tertiary pt-3 border-t border-stroke-subtle">
          <span>{pendingTasks} tasks remaining</span>
          {dueInfo && (
            <span className={`flex items-center gap-1 ${dueInfo.urgent ? 'text-status-warning' : ''}`}>
              <Calendar className="w-3 h-3" />
              {dueInfo.text}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
};

// Compact variant for lists
export const ReleaseCardCompact: React.FC<ReleaseCardProps> = ({ 
  release, 
  pendingTasks = 0,
  totalTasks = 16,
}) => {
  const router = useRouter();
  const healthScore = totalTasks > 0 ? Math.round(((totalTasks - pendingTasks) / totalTasks) * 100) : 0;

  return (
    <div 
      onClick={() => router.push(`/releases/${release.id}`)}
      className="flex items-center gap-4 p-3 rounded-lg hover:bg-bg-hover cursor-pointer transition-colors duration-fast group"
    >
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-lg bg-bg-elevated flex-shrink-0 flex items-center justify-center overflow-hidden">
        {release.coverArt ? (
          <img src={release.coverArt} alt="" className="w-full h-full object-cover" />
        ) : (
          <Music className="w-5 h-5 text-content-quaternary" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-content-primary truncate group-hover:text-brand transition-colors">
          {release.title}
        </h4>
        <p className="text-sm text-content-tertiary truncate">{release.artistName}</p>
      </div>

      {/* Progress */}
      <div className="flex-shrink-0 text-right">
        <div className="text-sm font-semibold text-brand tabular-nums">{healthScore}%</div>
        <div className="text-xs text-content-quaternary">{pendingTasks} left</div>
      </div>
    </div>
  );
};

// components/releases/CompletionScreen.tsx
'use client';

import { useState, useEffect } from 'react';
import { 
  PartyPopper, 
  CheckCircle2, 
  Calendar, 
  TrendingUp,
  ArrowRight,
  Share2,
  Home
} from 'lucide-react';
import confetti from 'canvas-confetti';

// =============================================
// TYPES
// =============================================

interface CompletionScreenProps {
  releaseTitle: string;
  artistName: string;
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  releaseDate?: Date;
  onViewRelease: () => void;
  onBackToDashboard: () => void;
}

// =============================================
// STAT CARD
// =============================================

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <div className="bg-bg-elevated rounded-xl p-4 border border-stroke-subtle">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-2xl font-bold text-content-primary">{value}</p>
      <p className="text-sm text-content-tertiary">{label}</p>
    </div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function CompletionScreen({
  releaseTitle,
  artistName,
  totalTasks,
  completedTasks,
  skippedTasks,
  releaseDate,
  onViewRelease,
  onBackToDashboard,
}: CompletionScreenProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  // Fire confetti on mount
  useEffect(() => {
    setShowConfetti(true);
    
    // Fire confetti
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ['#7C3AED', '#22C55E', '#F59E0B', '#3B82F6'];

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors,
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  }, []);

  const completionRate = Math.round((completedTasks / totalTasks) * 100);
  const daysUntilRelease = releaseDate
    ? Math.ceil((new Date(releaseDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="min-h-screen bg-bg-base flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        {/* Celebration Icon */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-brand to-purple-500 flex items-center justify-center shadow-lg shadow-brand/30">
            <PartyPopper className="w-12 h-12 text-white" />
          </div>
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
        </div>

        {/* Headline */}
        <h1 className="text-3xl font-bold text-content-primary mb-2">
          Campaign Complete! 🎉
        </h1>
        <p className="text-lg text-content-secondary mb-2">
          &quot;{releaseTitle}&quot; is ready to go
        </p>
        <p className="text-content-tertiary">
          by {artistName}
        </p>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm mt-8 mb-8">
          <StatCard
            icon={CheckCircle2}
            label="Tasks Completed"
            value={completedTasks}
            color="bg-green-500"
          />
          <StatCard
            icon={TrendingUp}
            label="Completion Rate"
            value={`${completionRate}%`}
            color="bg-brand"
          />
          {daysUntilRelease !== null && (
            <StatCard
              icon={Calendar}
              label={daysUntilRelease > 0 ? 'Days Until Release' : 'Release Day!'}
              value={daysUntilRelease > 0 ? daysUntilRelease : '🎵'}
              color="bg-blue-500"
            />
          )}
          {skippedTasks > 0 && (
            <StatCard
              icon={Share2}
              label="Skipped Tasks"
              value={skippedTasks}
              color="bg-status-warning"
            />
          )}
        </div>

        {/* Motivational Message */}
        <div className="bg-brand/10 border border-brand/20 rounded-2xl p-6 max-w-sm w-full mb-8">
          <p className="text-brand font-medium mb-2">Great work! 💪</p>
          <p className="text-sm text-content-secondary">
            You&apos;ve completed all the marketing tasks for this release. 
            Your audience is waiting—it&apos;s time to make some noise!
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="p-6 border-t border-stroke-subtle bg-bg-surface space-y-3">
        <button
          onClick={onViewRelease}
          className="w-full py-4 bg-brand text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-brand/90 transition-colors"
        >
          View Release
          <ArrowRight className="w-5 h-5" />
        </button>
        
        <button
          onClick={onBackToDashboard}
          className="w-full py-4 border border-stroke-subtle rounded-xl text-content-secondary font-medium flex items-center justify-center gap-2 hover:bg-bg-hover transition-colors"
        >
          <Home className="w-5 h-5" />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

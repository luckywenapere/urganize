'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { CoverArtGrade } from '@/lib/cover-art-dsp';

/**
 * One line saying whether the artwork is ready for the distributor.
 *
 * Shared by the Cover art scene and the post-completion prompt sheet so both
 * describe the same file the same way. Renders nothing for a null grade
 * ("we have not measured this image") and nothing for 'blocked' — a blocked
 * file was never uploaded, and its reason is surfaced as the picker's error
 * instead, so showing both would say it twice.
 */
export function CoverArtDspNote({
  grade,
  className = '',
}: {
  grade: CoverArtGrade | null;
  className?: string;
}) {
  if (!grade || grade.verdict === 'blocked') return null;

  const isReady = grade.verdict === 'ready';
  const Icon = isReady ? CheckCircle2 : AlertTriangle;

  return (
    <p
      className={`flex items-start gap-1.5 text-xs ${
        isReady ? 'text-brand' : 'text-status-warning'
      } ${className}`.trim()}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {grade.headline}
        {grade.detail ? <span className="text-content-secondary"> {grade.detail}</span> : null}
      </span>
    </p>
  );
}

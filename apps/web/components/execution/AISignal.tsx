'use client';

import { Sparkles, TriangleAlert } from 'lucide-react';
import type { AISignal as AISignalType } from '@/lib/execution-types';

export function AISignal({
  signal,
  onAction,
}: {
  signal: AISignalType;
  onAction?: (signal: AISignalType) => void;
}) {
  const isCritical = signal.severity === 'critical';
  const Icon = isCritical ? TriangleAlert : Sparkles;

  return (
    <div className={`rounded-[18px] border p-4 ${isCritical ? 'border-status-error/30 bg-status-error/10' : 'border-stroke-subtle bg-bg-elevated'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isCritical ? 'bg-status-error/15 text-status-error' : 'bg-brand-muted text-brand'}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-content-primary">{signal.title}</p>
          <p className="mt-1 text-sm leading-6 text-content-secondary">{signal.message}</p>
          {signal.actionLabel && onAction ? (
            <button
              type="button"
              onClick={() => onAction(signal)}
              className="mt-3 rounded-full border border-brand/25 bg-brand px-3 py-1.5 text-xs font-semibold text-content-inverse hover:bg-brand-hover"
            >
              {signal.actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

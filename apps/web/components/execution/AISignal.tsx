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
  const isWarning = signal.severity === 'warning';

  const severityBorderClass = isCritical
    ? 'border-l-status-error'
    : isWarning
      ? 'border-l-status-warning'
      : 'border-l-status-success';

  return (
    <div className={`animate-slide-left rounded-sm border border-white/5 border-l-2 p-4 shadow-none ${severityBorderClass} bg-bg-elevated/40 opacity-0`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
           <p className="text-sm font-semibold text-content-primary font-display">{signal.title}</p>
        </div>
        <p className="mt-1 text-xs leading-5 text-content-secondary font-sans opacity-80">{signal.message}</p>
        {signal.actionLabel && onAction ? (
          <button
            type="button"
            onClick={() => onAction(signal)}
            className="mt-4 border border-green-400/40 bg-transparent px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-green-400 font-mono hover:bg-green-400/5 transition-all"
          >
            {signal.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

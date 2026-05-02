'use client';

import { Lock } from 'lucide-react';
import {
  RELEASE_PIPELINE_STATES,
  type ReleasePipelineState,
} from '@/lib/execution-types';
import {
  canOpenPipelineState,
  getPipelineStateIndex,
  getPipelineStateLabel,
} from '@/lib/release-execution';

export function StateStepper({
  currentState,
  selectedState,
  onSelect,
  mobile = false,
}: {
  currentState: ReleasePipelineState;
  selectedState: ReleasePipelineState;
  onSelect: (state: ReleasePipelineState) => void;
  mobile?: boolean;
}) {
  return (
    <nav className={mobile ? 'grid grid-cols-6 gap-1' : 'space-y-2'}>
      {RELEASE_PIPELINE_STATES.map((state) => {
        const unlocked = canOpenPipelineState(currentState, state);
        const selected = selectedState === state;
        const complete = getPipelineStateIndex(state) < getPipelineStateIndex(currentState);
        return (
          <button
            key={state}
            type="button"
            disabled={!unlocked}
            onClick={() => onSelect(state)}
            className={`flex min-h-11 items-center gap-2 rounded-none border px-3 text-left text-xs font-semibold transition ${
              selected
                ? 'border-brand/40 bg-brand-muted text-content-primary'
                : complete
                  ? 'border-stroke-subtle bg-bg-elevated text-content-primary'
                  : unlocked
                    ? 'border-stroke-subtle bg-bg-surface text-content-secondary hover:bg-bg-hover'
                    : 'border-stroke-subtle bg-bg-surface/50 text-content-tertiary'
            } ${mobile ? 'justify-center px-1' : ''}`}
            title={getPipelineStateLabel(state)}
          >
            {!unlocked ? <Lock className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-none bg-current" />}
            <span className={mobile ? 'sr-only' : ''}>{getPipelineStateLabel(state)}</span>
          </button>
        );
      })}
    </nav>
  );
}

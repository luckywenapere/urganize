'use client';

import { Search, Sparkles } from '@/components/icons';
import { useShellStore } from '@/stores/useShellStore';

/**
 * The "Search or ask UrgAns" bar at the top of Home. It looks like a search box
 * and opens the same palette as Ctrl or Command K, so there is one place to find
 * a rollout or hand a question to UrgAns.
 */
export function HomeAskBar() {
  const openCommand = useShellStore((state) => state.openCommand);
  return (
    <button
      type="button"
      onClick={openCommand}
      className="motion-focus flex h-14 w-full items-center gap-3 rounded-full border border-stroke-control bg-bg-surface px-5 text-left text-base text-content-secondary hover:border-content-secondary"
    >
      <Search className="h-5 w-5 shrink-0 text-content-tertiary" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">Search or ask UrgAns</span>
      <Sparkles className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
    </button>
  );
}

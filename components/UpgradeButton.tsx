'use client';

import Link from 'next/link';

interface UpgradeButtonProps {
  isSubscribed?: boolean;
}

export function UpgradeButton({ isSubscribed = false }: UpgradeButtonProps) {
  if (isSubscribed) {
    return (
      <div className="flex items-center gap-1.5 h-8 px-2 md:px-3 text-sm font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
        <span>✨</span>
        <span className="hidden sm:inline">Pro</span>
      </div>
    );
  }

  return (
    <Link
      href="/pricing"
      className="flex items-center gap-1.5 h-8 px-2 md:px-3 text-sm font-medium text-black bg-white hover:bg-zinc-200 rounded-md transition-colors"
    >
      <span>✨</span>
      <span className="hidden sm:inline">Upgrade</span>
    </Link>
  );
}
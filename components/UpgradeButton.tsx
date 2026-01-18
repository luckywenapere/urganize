'use client';

import Link from 'next/link';

interface UpgradeButtonProps {
  isSubscribed?: boolean;
}

export function UpgradeButton({ isSubscribed = false }: UpgradeButtonProps) {
  if (isSubscribed) {
    return (
      <div className="flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
        <span>✨</span>
        <span>Pro</span>
      </div>
    );
  }

  return (
    <Link
      href="/pricing"
      className="flex items-center gap-1.5 h-8 px-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 rounded-md transition-all shadow-sm hover:shadow-emerald-500/25"
    >
      <span>⚡</span>
      <span>Upgrade</span>
    </Link>
  );
}
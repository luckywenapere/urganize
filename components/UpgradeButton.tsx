'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

interface UpgradeButtonProps {
  isSubscribed?: boolean;
}

export function UpgradeButton({ isSubscribed = false }: UpgradeButtonProps) {
  if (isSubscribed) {
    return (
      <div className="hidden md:flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md">'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

interface UpgradeButtonProps {
  isSubscribed?: boolean;
}

export function UpgradeButton({ isSubscribed = false }: UpgradeButtonProps) {
  if (isSubscribed) {
    return (
      <div className="hidden md:flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Pro</span>
      </div>
    );
  }

  return (
    <Link
      href="/pricing"
      className="hidden md:flex items-center gap-1.5 h-8 px-3 text-sm font-medium text-black bg-white hover:bg-zinc-200 rounded-md transition-colors"
    >
      <Sparkles className="w-3.5 h-3.5" />
      <span>Upgrade</span>
    </Link>
  );
}
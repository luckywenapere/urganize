'use client';

import Link from 'next/link';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle2 } from '@/components/icons';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import type { AttentionItem, AttentionTone } from '@/lib/home/attention';
import { HomeStack } from './HomeStack';

const TONE: Record<AttentionTone, { badge: string; Icon: typeof AlertCircle }> = {
  urgent: { badge: 'bg-status-error/10 text-status-error', Icon: AlertTriangle },
  warn: { badge: 'bg-status-warning/10 text-status-warning', Icon: AlertCircle },
  good: { badge: 'bg-status-success/10 text-status-success', Icon: CheckCircle2 },
  info: { badge: 'bg-status-info/10 text-status-info', Icon: AlertCircle },
};

/**
 * "For you today": the few things that need a manager now, each with one place
 * to go, as one stack. The whole card is the link (it stretches over the card),
 * so the folded top card is as easy to tap as an open one.
 */
export function AttentionStack({ items }: { items: readonly AttentionItem[] }) {
  return (
    <HomeStack
      label={HOME_BLOCK_LABELS.attention}
      items={items}
      getKey={(item) => item.key}
      renderItem={(item) => {
        const { badge, Icon } = TONE[item.tone];
        return (
          <div className="flex items-start gap-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${badge}`} aria-hidden="true">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <Link
                href={item.href}
                onClick={item.href === '/dashboard' ? leaveReleaseForCatalog : undefined}
                className="motion-focus block text-sm font-semibold text-content-primary after:absolute after:inset-0 after:rounded-2xl after:content-['']"
              >
                {item.title}
              </Link>
              <span className="mt-0.5 block text-xs text-content-secondary">{item.detail}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand">
                {item.action}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </span>
          </div>
        );
      }}
    />
  );
}

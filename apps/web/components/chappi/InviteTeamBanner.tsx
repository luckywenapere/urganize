'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { getRolePermissions } from '@/lib/role-permissions';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// Dismissal is remembered per browser (PostHog's home-banner behavior): the
// banner stays gone once closed rather than nagging every visit.
const DISMISSED_KEY = 'urganize.chappi.invite-banner-dismissed';
const DISMISSED_VERSION = 1;
const isPersistedDismissed = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * Slim "invite your team" banner at the top of the Chappi home — the
 * PostHog "Get more out of PostHog by inviting your team" pattern. Routes to
 * Settings → Teammates (the existing invite surface; the section carries an
 * `id="teammates"` anchor). Renders nothing until mount so dismissed users
 * never see a flash: default hidden, shown by the mount effect only when no
 * dismissal is persisted.
 */
export function InviteTeamBanner() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dismissed = readPersistedState(DISMISSED_KEY, DISMISSED_VERSION, isPersistedDismissed);
    if (dismissed !== true) {
      setIsVisible(true);
    }
  }, []);

  // The Settings → Teammates section (the banner's destination) only renders
  // for manager accounts — same gate as SettingsPageClient's
  // isManagerAccount. Artists would land on a page without the section, so
  // the banner doesn't show for them at all.
  const isManagerAccount = getRolePermissions(user?.role).role === 'manager';
  if (!isManagerAccount || !isVisible) return null;

  return (
    <div className="mb-4 flex flex-col items-start gap-3 border border-stroke-default bg-bg-surface px-3 py-2 sm:flex-row sm:items-center sm:px-4">
      <p className="min-w-0 flex-1 text-sm text-content-secondary sm:truncate">
        Get more out of Urganize by inviting your team
      </p>
      {/* ?tab=team since 2026-08-13, when Settings became tabbed — the old
          '#teammates' anchor still resolves (the page client redirects it) but
          this is the direct route. */}
      <button
        type="button"
        onClick={() => router.push('/settings?tab=team')}
        className="motion-focus motion-press inline-flex h-auto min-h-8 shrink-0 items-center gap-1.5 self-stretch border border-stroke-default bg-bg-elevated px-3 py-1.5 text-left text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover sm:self-auto"
      >
        <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Invite artists, freelancers and team members
      </button>
      <button
        type="button"
        onClick={() => {
          setIsVisible(false);
          writePersistedState(DISMISSED_KEY, DISMISSED_VERSION, true);
        }}
        aria-label="Dismiss invite banner"
        className="motion-focus motion-press grid h-7 w-7 shrink-0 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AppearanceChoice } from '@/components/settings/AppearanceChoice';
import { ChevronRight, LayoutDashboard, LogOut, Radio, SunMoon, Upload, X } from '@/components/icons/lucide';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { useAuthStore } from '@/lib/auth-store';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { useMusicAccount } from './useMusicAccount';

const ROW =
  'motion-focus flex min-h-[56px] w-full items-center gap-3 border-b border-content-primary/[0.08] text-left text-[15px] font-medium text-content-primary last:border-b-0';

function Row({ icon, title, hint, accent = false }: { icon: ReactNode; title: string; hint?: string; accent?: boolean }) {
  return (
    <>
      <span aria-hidden="true" className={`flex-none ${accent ? 'text-brand' : 'text-content-secondary'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{title}</span>
        {hint ? <span className="block text-xs font-normal text-content-tertiary">{hint}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 flex-none text-content-tertiary" aria-hidden="true" />
    </>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="mt-3.5 rounded-2xl border border-content-primary/[0.08] bg-bg-surface px-3.5">{children}</div>;
}

/**
 * The circle menu (#1364): everything on the music side that is not listening.
 * Signed in: the Artist dashboard, Upload a song, Playlist pitches, Appearance,
 * Sign out. Signed out: the two ways in and Appearance, and a line saying
 * listening needs neither. It replaces the old Dashboard button and the
 * Settings tab.
 */
export function MusicMenuSheet({ onClose, onUpload }: { onClose: () => void; onUpload: () => void }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, hasTeam, hasPlaylists, logout } = useMusicAccount();
  const name = useAuthStore((state) => state.user?.name ?? '');
  const team = useWorkspaceIdentityStore((state) => state.name);
  const loadTeam = useWorkspaceIdentityStore((state) => state.load);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    if (hasTeam) void loadTeam();
  }, [hasTeam, loadTeam]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      onClose();
      router.replace('/music');
    }
  };

  const signedIn = isAuthenticated && !isLoading;

  return (
    <div className="fixed inset-0 z-[170] flex flex-col bg-black/40" onClick={onClose}>
      <DialogPanel
        label={signedIn ? 'Menu' : 'Run your music from here'}
        onClose={onClose}
        className="mt-auto max-h-[92dvh] overflow-y-auto rounded-t-3xl border-t border-content-primary/[0.08] bg-bg-base px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2.5 md:mx-auto md:my-auto md:w-full md:max-w-md md:rounded-3xl md:border"
      >
        <div onClick={(event) => event.stopPropagation()}>
          <div className="mx-auto mb-3.5 h-1 w-[38px] rounded-full bg-content-primary/[0.16] md:hidden" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4">
            {signedIn ? (
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-[-0.03em] text-content-primary">{name || 'Your account'}</h2>
                {team ? <p className="truncate text-[13px] text-content-secondary">{team}</p> : null}
              </div>
            ) : (
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-[-0.03em] text-content-primary">Run your music from here</h2>
                <p className="mt-0.5 text-[13px] text-content-secondary">
                  The dashboard is where artists, managers and labels plan rollouts and put their songs on Urganize Music.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="motion-focus -mr-2 -mt-1 inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-content-secondary hover:bg-content-primary/[0.06]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {signedIn ? (
            hasTeam || hasPlaylists ? (
              <Group>
                {hasTeam ? (
                  <Link href="/dashboard" onClick={onClose} className={ROW}>
                    <Row accent icon={<LayoutDashboard className="h-5 w-5" />} title="Artist dashboard" hint="Your rollouts and team" />
                  </Link>
                ) : null}
                {hasTeam ? (
                  <button type="button" onClick={onUpload} className={ROW}>
                    <Row accent icon={<Upload className="h-5 w-5" />} title="Upload a song" hint="Put a song on Urganize Music" />
                  </button>
                ) : null}
                {hasPlaylists ? (
                  <Link href="/curator" onClick={onClose} className={ROW}>
                    <Row icon={<Radio className="h-5 w-5" />} title="Playlist pitches" />
                  </Link>
                ) : null}
              </Group>
            ) : null
          ) : (
            <div className="mt-4 space-y-2.5">
              <Link
                href="/onboarding"
                data-autofocus
                className="motion-focus motion-press flex h-12 items-center justify-center rounded-[14px] bg-content-primary px-5 text-[15px] font-semibold text-bg-base transition-opacity hover:opacity-90"
              >
                Create my account
              </Link>
              <Link
                href="/auth?next=/dashboard"
                className="motion-focus motion-press flex h-12 items-center justify-center rounded-[14px] border border-content-primary/[0.16] px-5 text-[15px] font-semibold text-content-primary transition-colors hover:bg-content-primary/[0.06]"
              >
                I have an account. Sign in
              </Link>
            </div>
          )}

          <Group>
            <div className="flex min-h-[52px] items-center gap-3 text-[15px] font-medium text-content-primary">
              <SunMoon className="h-5 w-5 text-content-secondary" aria-hidden="true" />
              Appearance
            </div>
            <AppearanceChoice className="pb-3" showAbout={false} />
          </Group>

          {signedIn ? (
            <Group>
              <button type="button" onClick={() => void signOut()} disabled={signingOut} className={`${ROW} disabled:opacity-60`}>
                <LogOut className="h-5 w-5 flex-none text-content-secondary" aria-hidden="true" />
                <span className="flex-1">{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </Group>
          ) : (
            <p className="mt-4 text-center text-[12.5px] text-content-tertiary">Just listening? You don&apos;t need an account.</p>
          )}
        </div>
      </DialogPanel>
    </div>
  );
}

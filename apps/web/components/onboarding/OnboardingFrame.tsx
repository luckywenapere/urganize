'use client';

// The onboarding frame (#854, design-direction.md): the app with the lights
// half on. Logo top left and the avatar top right, where the app's top bar
// puts them; one 480px column on a phone, two columns on a computer; the
// question is the page heading in the display face (DM Sans Bold).
//
// One look for every control here: one spring-green primary pill with ink
// text, outlined secondaries, sentence-case labels, and one radius scale
// (12 for fields and rows, 16 for surfaces, full for buttons and chips).

import { useEffect, useRef, type ReactNode } from 'react';
import { Logo, LogoIcon } from '@urganize/ui/Logo';
import Image from 'next/image';
import { MyFace } from '@/components/shared/AccountPhoto';
import { SetupSteps } from '@/components/onboarding/SetupSteps';

export const primaryButtonClass =
  'motion-press inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full bg-brand px-5 text-[15px] font-semibold text-content-inverse transition-colors duration-fast ease-standard hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-bg-hover disabled:text-content-tertiary';

export const secondaryButtonClass =
  'motion-press inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-full border border-stroke-control bg-transparent px-5 text-[15px] font-semibold text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50';

export const smallSecondaryClass =
  'motion-press inline-flex min-h-11 items-center justify-center rounded-full border border-stroke-control bg-transparent px-4 text-sm font-semibold text-content-primary transition-colors duration-fast ease-standard hover:bg-bg-hover disabled:opacity-50';

export const textLinkClass =
  "relative after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-[''] text-content-primary underline decoration-content-tertiary underline-offset-[3px] transition-colors hover:decoration-content-primary";

export const inputClass =
  'block h-12 w-full rounded-xl border border-stroke-control bg-bg-base px-3.5 text-base text-content-primary outline-none transition-colors duration-fast ease-standard placeholder:text-content-tertiary focus:border-brand disabled:opacity-50';

export const labelClass = 'mb-1.5 block text-[13.5px] font-semibold text-content-primary';
export const hintClass = 'mt-1.5 block text-[13px] text-content-tertiary';
export const errorTextClass = 'mt-1.5 block text-[13px] text-status-error';
export const surfaceClass = 'rounded-2xl border border-stroke-control bg-bg-surface';

export function chipClass(selected: boolean): string {
  return `motion-press inline-flex min-h-11 items-center rounded-full border px-4 text-sm text-content-primary transition-colors duration-fast ease-standard ${
    selected ? 'border-brand bg-brand/10 shadow-[inset_0_0_0_0.5px_rgb(var(--color-brand))]' : 'border-stroke-control bg-bg-base hover:bg-bg-hover'
  }`;
}

export function initialsOf(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0] || '')
      .join('')
      .toUpperCase() || '?'
  );
}

/** Flat initials tile, never a gradient. */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-bg-hover text-xs font-semibold text-content-secondary"
      style={{ width: size, height: size }}
    >
      {initialsOf(name)}
    </span>
  );
}

export function TopBar({ name }: { name?: string | null }) {
  return (
    // Same box as the app's TopNav (max 1440, px-8 and 72px tall from lg), and
    // the same wordmark there, so landing in the app does not move the logo.
    <header className="mx-auto flex h-14 w-full max-w-[1440px] shrink-0 items-center justify-between px-4 sm:px-5 lg:h-[72px] lg:px-8">
      <div className="flex items-center gap-2 text-[15px] font-semibold lg:hidden">
        <LogoIcon size={26} priority />
        <span>Urganize</span>
      </div>
      <Logo size="sm" priority className="hidden opacity-95 lg:flex" />
      {name ? <MyFace size={32} fallback={<Avatar name={name} />} /> : null}
    </header>
  );
}

/** The page: top bar, then one column (two on a computer when `aside` is given). */
export function OnboardingFrame({
  name,
  children,
  narrow = false,
}: {
  name?: string | null;
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <main className="relative flex min-h-screen flex-col text-content-primary">
      <TopBar name={name} />
      <div
        className={`mx-auto w-full px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] pt-5 ${
          narrow ? 'max-w-[480px] md:max-w-[440px] md:pt-10' : 'max-w-[480px] md:max-w-[1000px] md:px-8 md:pt-14'
        }`}
      >
        {children}
      </div>
    </main>
  );
}

/**
 * Create your account (#1229, mock docs/mocks/signin-onboarding-desktop,
 * screen 2). On a phone it is the narrow frame above, unchanged. On a computer
 * it takes the sign-in page's two halves: logo and the three steps on top, the
 * form in the middle of the left half, and the same studio photo filling the
 * right, so moving between the two does not feel like a different app. CSS
 * only, so the page stays static.
 */
export function SignupSplitFrame({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col text-content-primary lg:grid lg:grid-cols-2">
      <div className="flex min-h-screen flex-col lg:px-14 lg:pb-10 lg:pt-8">
        <div className="lg:hidden">
          <TopBar />
        </div>
        <div className="hidden items-center justify-between gap-6 lg:flex">
          <Logo size="sm" priority className="opacity-95" />
          <SetupSteps current={1} />
        </div>
        <div className="mx-auto w-full max-w-[480px] px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] pt-5 md:max-w-[440px] md:pt-10 lg:my-auto lg:max-w-[400px] lg:px-0 lg:py-12">
          {children}
        </div>
      </div>
      {/* Photo: Dwayne Joe on Unsplash (unsplash.com/photos/C8VidHnIysM),
          Unsplash License. The sign-in page shows the same one. */}
      <div className="hidden lg:block lg:p-4 lg:pl-0">
        <Image
          src="/images/auth-studio.webp"
          alt="Two people at work in a recording studio. Photo by Dwayne Joe on Unsplash."
          width={960}
          height={1200}
          sizes="50vw"
          className="sticky top-4 h-[calc(100vh-32px)] min-h-[560px] w-full rounded-[20px] object-cover grayscale"
        />
      </div>
    </main>
  );
}

/** Left: heading, line, account. Right: the cards. Stacked on a phone. */
export function Split({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="animate-fade-in md:grid md:grid-cols-[minmax(0,1fr)_460px] md:items-start md:gap-14">
      <div className="md:sticky md:top-0 md:pt-2">{left}</div>
      <div className="mt-5 md:mt-0">{right}</div>
    </div>
  );
}

export function Heading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h1
      id={id}
      className="text-balance font-display text-[30px] font-normal leading-[1.12] tracking-[-0.012em] text-content-primary md:text-[40px]"
    >
      {children}
    </h1>
  );
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-pretty text-[15px] text-content-secondary">{children}</p>;
}

/** {avatar} {email} · Not you? Log out. On a computer it sits under the heading; on a phone, at the bottom. */
export function AccountChip({
  name,
  email,
  onLogout,
  logoutLabel = 'Not you? Log out',
  place,
}: {
  name: string;
  email: string;
  onLogout: () => void;
  logoutLabel?: string;
  place: 'top' | 'bottom';
}) {
  return (
    <div
      className={`min-w-0 items-center gap-2.5 text-[13.5px] text-content-secondary ${
        place === 'top' ? 'mt-5 hidden md:flex' : 'mt-7 flex border-t border-stroke-control pt-4 md:hidden'
      }`}
    >
      <MyFace size={32} fallback={<Avatar name={name || email} />} />
      <span className="min-w-0 truncate text-content-primary">{email}</span>
      <button type="button" onClick={onLogout} className={`ml-auto shrink-0 ${textLinkClass} text-content-secondary`}>
        {logoutLabel}
      </button>
    </div>
  );
}

/** A small text Back with a chevron. Never a second pill. */
export function BackLink({ onClick, children = 'Back' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 mb-1 inline-flex min-h-11 items-center gap-1 px-1 text-sm text-content-secondary hover:text-content-primary"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="m15 6-6 6 6 6" />
      </svg>
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-stroke-control border-t-brand motion-reduce:animate-none"
    />
  );
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export const icons = {
  plus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  disc: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ),
  people: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.2c2.2.2 3.8 1.8 4.4 4.3" />
    </svg>
  ),
  chevron: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-content-tertiary">
      <path d="m9 6 6 6-6 6" />
    </svg>
  ),
  chevronDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  whatsapp: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-1.4-.7-2-1.3-.5-.5-.9-1-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.6.6-.9 1.4-.9 2.2 0 .9.4 1.8.9 2.5 1.1 1.6 2.5 2.9 4.2 3.6.6.3 1.1.4 1.6.5.7.1 1.4 0 2-.4.4-.3.7-.7.8-1.2v-.6c0-.1-.2-.2-.4-.3z" />
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  ),
};

/** A row-shaped card that opens something: 40px tile, title, one line, chevron. */
export function ActionCard({
  tile,
  brand = false,
  title,
  line,
  onClick,
}: {
  tile: ReactNode;
  brand?: boolean;
  title: string;
  line: ReactNode;
  onClick: () => void;
}) {
  return (
    <div className={`${surfaceClass} overflow-clip`}>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors duration-fast hover:bg-bg-hover"
      >
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
            brand ? 'bg-brand text-content-inverse' : 'bg-bg-hover text-content-secondary'
          }`}
        >
          {tile}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-content-primary">{title}</span>
          <span className="block text-[13px] text-content-secondary">{line}</span>
        </span>
        {icons.chevron}
      </button>
    </div>
  );
}

/** Bottom sheet on a phone, centred dialog on a computer. Closes on the X, the scrim and Escape. */
export function Sheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Focus moves into the sheet, and back to whatever opened it on close.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 animate-fade-in bg-[rgb(13_18_14/0.55)]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="absolute inset-x-0 bottom-0 max-h-[88vh] animate-fade-in overflow-y-auto overscroll-contain rounded-t-[22px] border-t border-stroke-control bg-bg-surface px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-2 text-content-primary outline-none md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[460px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border md:p-6"
      >
        <div className="mx-auto mb-2.5 mt-1 h-1 w-10 rounded-full bg-stroke-control md:hidden" aria-hidden="true" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full text-xl text-content-secondary hover:bg-bg-hover"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

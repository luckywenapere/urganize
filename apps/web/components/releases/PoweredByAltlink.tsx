// "powered by Altlink", as the MOU asks (Oct 28 call, #852): sentence case,
// Altlink's own wordmark (public/partners/altlink.png, their file unchanged),
// linked to their landing page. Dark mode shows the same file inverted to white
// (.partner-logo-invert in globals.css); Oyin approved the mock
// docs/mocks/powered-by-altlink on Oct 29, 2026.
//
// The "line" variant (#889, mock docs/mocks/altlink-credit-placement, option A):
// on the Artists page the credit is one small left-aligned line inside the
// Out now list that names the job ("Smart links powered by"), so it reads as
// the links' credit, never as the page's maker.

export const ALTLINK_HOME_URL = 'https://altlink.co';

export function PoweredByAltlink({ className = '', variant = 'centred' }: { className?: string; variant?: 'centred' | 'line' }) {
  const line = variant === 'line';
  return (
    <p
      className={
        line
          ? `flex items-center gap-1.5 text-xs text-content-tertiary ${className}`
          : `flex items-center justify-center gap-2 pt-2 text-[13px] text-content-secondary ${className}`
      }
    >
      {line ? 'Smart links powered by' : 'powered by'}
      <a
        href={ALTLINK_HOME_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Altlink"
        className="motion-focus inline-flex rounded transition-opacity hover:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/partners/altlink.png" alt="Altlink" width={75} height={15} className={`partner-logo-invert block w-auto ${line ? 'h-3' : 'h-[15px]'}`} />
      </a>
    </p>
  );
}

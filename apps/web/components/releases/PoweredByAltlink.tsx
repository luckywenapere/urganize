// "powered by Altlink", as the MOU asks (Oct 28 call, #852): sentence case,
// Altlink's own wordmark (public/partners/altlink.png, their file unchanged),
// linked to their landing page. Dark mode shows the same file inverted to white
// (.partner-logo-invert in globals.css); Oyin approved the mock
// docs/mocks/powered-by-altlink on Oct 29, 2026.

export const ALTLINK_HOME_URL = 'https://altlink.co';

export function PoweredByAltlink({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-2 pt-2 text-[13px] text-content-secondary ${className}`}>
      powered by
      <a
        href={ALTLINK_HOME_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Altlink"
        className="motion-focus inline-flex rounded transition-opacity hover:opacity-80"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/partners/altlink.png" alt="Altlink" width={75} height={15} className="partner-logo-invert block h-[15px] w-auto" />
      </a>
    </p>
  );
}

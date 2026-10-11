import { PROFILE_GROWTH_COPY, profileCtaHref } from '@/lib/profile-growth';

// The foot of a person's public page (/p/{slug}), claimed or not (2026-10-11).
//
// It used to be a plain "Delivered with Urganize" line. The people who read a
// page like this are often other producers, engineers and managers, so it now
// carries two plain links: one for somebody who would want a page like it, one
// for a manager. Each goes through /api/public-profile/cta, which counts the
// tap and sends them on to sign up with where they came from.
//
// SERVER COMPONENT, NO SCRIPT. Plain anchors, so it works with JavaScript off
// and in a chat app's in-app browser. Same dark-locked .kit-island palette as
// the page, and the "Made with Urganize" mark /pitch and /k carry. rel=nofollow
// because the page is noindex and a crawler has no business following it.

const STROKE = 'var(--kit-border)';
const CREAM = 'var(--kit-text)';
const MUTED = 'var(--kit-text-muted)';
const FAINT = 'var(--kit-text-faint)';
const ACCENT = 'var(--kit-accent)';

export function ProfileGrowthFooter({ slug }: { slug: string }) {
  const rows = [
    { lead: PROFILE_GROWTH_COPY.collaboratorLead, cta: PROFILE_GROWTH_COPY.collaboratorCta, href: profileCtaHref(slug, 'collaborator') },
    { lead: PROFILE_GROWTH_COPY.managerLead, cta: PROFILE_GROWTH_COPY.managerCta, href: profileCtaHref(slug, 'manager') },
  ];

  return (
    <footer className="mt-20 pt-8" style={{ borderTop: `1px solid ${STROKE}` }}>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: FAINT }}>
        {PROFILE_GROWTH_COPY.mark}
      </p>
      <ul className="mt-4 space-y-1">
        {rows.map((row) => (
          <li key={row.href} className="text-sm" style={{ color: MUTED }}>
            <a
              href={row.href}
              rel="nofollow"
              className="group inline-flex min-h-11 flex-wrap items-center gap-x-2 underline-offset-4"
            >
              <span>{row.lead}</span>
              <span className="font-medium underline group-hover:no-underline" style={{ color: CREAM }}>
                {row.cta}
              </span>
              <span aria-hidden="true" style={{ color: ACCENT }}>
                →
              </span>
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}

import type { ReactNode } from 'react';

type HomeSectionShellProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
};

/** The one card frame every Home section uses, so the screen reads as one
 * system rather than seven components each inventing their own border and
 * padding. */
export function HomeSectionShell({ title, action, children, className = '', id }: HomeSectionShellProps) {
  return (
    <section id={id} className={`scroll-mt-24 rounded-xl border border-stroke-default bg-bg-surface p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-content-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

import type { ReactNode } from 'react';
import { InfoTip } from '@/components/shared/HelpTip';

type PageHeaderProps = {
  /** The page's one title, in the display face. Every page has exactly one. */
  title?: string;
  /** Live facts about this page (a count, who is shown, last contact). Static
   *  "what this page is for" text belongs in `info`, behind a tap. */
  description?: ReactNode;
  /** What the page is for. Shown behind an info icon beside the title, not as a
   *  grey line under it (founder call, 2026-10-05). */
  info?: string;
  /** The page's single primary action, rendered at the right (Deel's "Add
   *  people"). More than one filled button here defeats the point of it. */
  action?: ReactNode;
  className?: string;
};

/**
 * Title on the left, the page's one primary action on the right. Every page in
 * the new shell opens with this, so a manager always knows where they are and
 * what the main thing to do here is.
 *
 * Stacks on a phone, with the action under the title and full width, because the
 * right edge of a phone is the hardest corner to reach.
 */
export function PageHeader({ title, description, info, action, className = '' }: PageHeaderProps) {
  // No title: the tab row above already names the page, so only the live
  // facts and the one action remain, with less air above them.
  const spacing = title ? 'pb-6 pt-8 sm:pb-7 sm:pt-10' : 'pb-4 pt-5 sm:pb-5 sm:pt-6';
  return (
    <div className={`flex flex-col gap-4 ${spacing} sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {title ? (
          <div className="flex items-center gap-2">
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-content-primary sm:text-[44px]">
              {title}
            </h1>
            {info ? <InfoTip label={title} text={info} className="shrink-0" /> : null}
          </div>
        ) : null}
        {description ? <p className="mt-1.5 text-sm text-content-secondary">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{action}</div> : null}
    </div>
  );
}

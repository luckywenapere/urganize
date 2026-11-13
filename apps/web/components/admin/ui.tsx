import type { HTMLAttributes, ReactNode } from 'react';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

// The admin hub's small component set (2026-10-18, URG-369). Founder: "For UI
// elements reference shadcn". The repo has no shadcn/ui or Radix, and the one
// shared kit (packages/ui) has a Card and Button built for the product's
// marketing-weight surfaces. So these follow shadcn's component structure and
// prop names (Card / CardHeader / CardTitle / CardContent, Badge with variants,
// Separator, Skeleton, buttonVariants for a link that looks like a button)
// without adding a dependency, drawn in the app's own tokens and dark theme
// (bg-surface, stroke-default, content-*, brand). The info icon is the existing
// InfoTip (components/shared/HelpTip.tsx), the house Tooltip.
//
// Server-safe: no hooks, no 'use client'.

// One cn() for the app: shadcn's (clsx + tailwind-merge) in lib/utils.ts.
export { cn } from '@/lib/utils';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-stroke-default bg-bg-surface text-content-primary', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-medium text-content-secondary', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const BADGE: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-brand/10 text-brand',
  secondary: 'border-transparent bg-bg-hover text-content-secondary',
  outline: 'border-stroke-default text-content-secondary',
  destructive: 'border-transparent bg-status-error/10 text-status-error',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] tabular-nums',
        BADGE[variant],
        className
      )}
      {...props}
    />
  );
}

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" aria-hidden="true" className={cn('h-px w-full bg-stroke-subtle', className)} {...props} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <SkeletonBlock className={cn('rounded-md', className)} />;
}

type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'default' | 'sm';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  default: 'bg-brand text-content-inverse hover:bg-brand-hover',
  outline: 'border border-stroke-default text-content-primary hover:bg-bg-hover',
  ghost: 'text-content-secondary hover:bg-bg-hover hover:text-content-primary',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  default: 'h-10 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
};

/** shadcn's buttonVariants: the classes, for a Link that should read as a button. */
export function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(
    'motion-focus inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors',
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    className
  );
}

/**
 * A small heading over a block ("Today", "This week"), with an optional info
 * icon and an optional quiet link on the right ("Metrics ›"). Sentence case
 * since 2026-11-12 (#1241): no code-style capitals.
 */
export function SectionLabel({
  children,
  info,
  id,
  action,
}: {
  children: ReactNode;
  info?: ReactNode;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      <h2 id={id} className="text-sm font-semibold text-content-primary">
        {children}
      </h2>
      {info}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}

/**
 * shadcn's ToggleGroup (type="single"): a few options side by side, one on.
 * Drawn as a segmented control; a radio group to assistive tech.
 */
export function ToggleGroup<T extends string>({
  value,
  options,
  onValueChange,
  label,
  className,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onValueChange: (value: T) => void;
  /** What the group chooses, for screen readers ("Currency"). */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-stroke-default bg-bg-elevated p-1', className)}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'motion-focus h-9 rounded-lg text-sm transition-colors',
              on ? 'bg-bg-hover font-semibold text-content-primary' : 'text-content-secondary hover:text-content-primary'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

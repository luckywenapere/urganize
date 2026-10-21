'use client';

import React from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  kbd?: string;
  children: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      kbd,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        // While it works the button says so, and keeps its own name (below).
        aria-busy={isLoading || undefined}
        className={clsx(
          // Base
          'group inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em]',
          'transition-all duration-fast ease-out',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'press-effect',
          
          // Variants
          {
            // Primary
            'border border-brand/20 bg-brand text-content-inverse shadow-[0_16px_34px_-24px_rgba(62,207,142,0.52)] hover:-translate-y-[1px] hover:bg-brand-hover hover:shadow-[0_18px_38px_-24px_rgba(62,207,142,0.48)] active:translate-y-0 active:shadow-none':
              variant === 'primary',
            
            // Secondary
            'border border-stroke-default bg-white/[0.03] text-content-primary backdrop-blur-sm hover:-translate-y-[1px] hover:border-stroke-strong hover:bg-white/[0.05]':
              variant === 'secondary',
            
            // Ghost
            'border border-transparent bg-transparent text-content-secondary hover:bg-white/[0.04] hover:text-content-primary':
              variant === 'ghost',
            
            // Danger — opacity steps must exist in Tailwind's scale (…/10, /15,
            // /20, /25…). This was /12 and /18, which generate no rule at all,
            // so the fill was silently transparent and the button rendered
            // outline-only. Bare off-scale steps fail without any build error.
            'border border-status-error/20 bg-status-error/10 text-status-error hover:-translate-y-[1px] hover:bg-status-error/20':
              variant === 'danger',
          },
          
          // Sizes
          {
            'h-8 px-3 text-xs gap-1.5': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },
          
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <span
              aria-hidden="true"
              className={clsx('rounded-full skeleton-shimmer', {
                'h-3 w-3': size === 'sm',
                'h-4 w-4': size === 'md',
                'h-5 w-5': size === 'lg',
              })}
            />
            <span
              aria-hidden="true"
              className={clsx('rounded-full skeleton-shimmer', {
                'h-2.5 w-10': size === 'sm',
                'h-3 w-14': size === 'md',
                'h-3 w-16': size === 'lg',
              })}
            />
            {/* The button's own name, not the word "Loading": that swapped
                "Save" for a different label the moment it was pressed, so a
                screen reader heard the button turn into something else. */}
            <span className="sr-only">{children}</span>
          </>
        ) : (
          <>
            {leftIcon && (
              <span className="flex-shrink-0 -ml-0.5 transition-transform duration-fast group-hover:scale-110">
                {leftIcon}
              </span>
            )}
            <span>{children}</span>
            {rightIcon && (
              <span className="flex-shrink-0 -mr-0.5 transition-transform duration-fast">
                {rightIcon}
              </span>
            )}
            {kbd && (
              <kbd className="kbd ml-1 opacity-60">{kbd}</kbd>
            )}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

// Icon-only button variant
interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  tooltip?: string;
  children: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'default', size = 'md', tooltip, children, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'icon-btn',
          {
            'w-7 h-7': size === 'sm',
            'w-9 h-9': size === 'md',
            'w-11 h-11': size === 'lg',
          },
          tooltip ? 'tooltip' : 'hit-44 relative',
          className
        )}
        data-tooltip={tooltip}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

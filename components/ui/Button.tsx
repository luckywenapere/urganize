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
            'border border-transparent bg-brand text-content-inverse shadow-[0_12px_24px_-18px_rgba(32,29,27,0.55)] hover:-translate-y-[1px] hover:bg-brand-hover hover:shadow-[0_20px_36px_-22px_rgba(32,29,27,0.5)] active:translate-y-0 active:shadow-none':
              variant === 'primary',
            
            // Secondary
            'border border-stroke-default bg-white/55 text-content-primary backdrop-blur-sm hover:-translate-y-[1px] hover:border-stroke-strong hover:bg-white/75':
              variant === 'secondary',
            
            // Ghost
            'border border-transparent bg-transparent text-content-secondary hover:bg-brand/5 hover:text-content-primary':
              variant === 'ghost',
            
            // Danger
            'border border-transparent bg-status-error text-content-inverse hover:-translate-y-[1px] hover:brightness-95':
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
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading...</span>
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
          tooltip && 'tooltip',
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

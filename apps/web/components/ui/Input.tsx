'use client';

import React from 'react';
import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  inputClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, leftIcon, rightIcon, className, inputClassName, id, ...props }, ref) => {
    const inputId = id || React.useId();

    return (
      <div className={clsx('space-y-2', className)}>
        {label && (
          <label htmlFor={inputId} className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            {label}
          </label>
        )}
        <div
          className={clsx(
            'group flex items-center gap-3 rounded-[22px] border bg-white/60 px-4 py-3 backdrop-blur-sm transition-all duration-fast ease-out',
            'border-stroke-default focus-within:border-brand focus-within:bg-white/80 focus-within:shadow-[0_0_0_3px_rgba(32,29,27,0.06)]',
            error && 'border-status-error/50 focus-within:border-status-error focus-within:shadow-[0_0_0_3px_rgba(160,61,45,0.08)]',
            'dark:bg-white/[0.03] dark:focus-within:bg-white/[0.05]'
          )}
        >
          {leftIcon ? <span className="shrink-0 text-content-tertiary">{leftIcon}</span> : null}
          <input
            ref={ref}
            id={inputId}
            className={clsx(
              'min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-content-primary outline-none placeholder:text-content-quaternary',
              inputClassName
            )}
            {...props}
          />
          {rightIcon ? <span className="shrink-0 text-content-tertiary">{rightIcon}</span> : null}
        </div>
        {error ? (
          <p className="text-sm text-status-error">{error}</p>
        ) : hint ? (
          <p className="text-sm text-content-secondary">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

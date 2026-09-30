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
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const messageId = `${inputId}-message`;

    return (
      <div className={clsx('space-y-2', className)}>
        {label && (
          <label htmlFor={inputId} className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            {label}
          </label>
        )}
        <div
          className={clsx(
            'group flex items-center gap-3 rounded-[22px] border bg-white/[0.04] px-4 py-3 backdrop-blur-sm transition-all duration-fast ease-out',
            'border-stroke-control focus-within:border-brand focus-within:bg-white/[0.05] focus-within:shadow-[0_0_0_3px_rgba(62,207,142,0.12)]',
            error && 'border-status-error/40 focus-within:border-status-error focus-within:shadow-[0_0_0_3px_rgba(240,106,106,0.12)]'
          )}
        >
          {leftIcon ? <span className="shrink-0 text-content-tertiary">{leftIcon}</span> : null}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || hint ? messageId : undefined}
            className={clsx(
              // focus-visible:outline-none is not redundant: the app-wide :focus-visible
              // ring outranks a bare outline-none, so without it a square ring was
              // drawn INSIDE this pill on top of the pill's own focus border.
              'min-w-0 flex-1 border-0 bg-transparent p-0 text-[15px] text-content-primary outline-none focus-visible:outline-none placeholder:text-content-tertiary',
              inputClassName
            )}
            {...props}
          />
          {rightIcon ? <span className="shrink-0 text-content-tertiary">{rightIcon}</span> : null}
        </div>
        {error ? (
          <p id={messageId} role="alert" className="text-sm text-status-error">{error}</p>
        ) : hint ? (
          <p id={messageId} className="text-sm text-content-secondary">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

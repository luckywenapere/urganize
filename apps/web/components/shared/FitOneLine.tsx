'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One line of text that shrinks to fit its box (artist name, 2026-11-12).
 *
 * The class names set the full size. If the text is wider than its box, the
 * font size is scaled down to fit, never below `minPx`; past that it ends in
 * an ellipsis. Re-measured whenever the box resizes or fonts finish loading.
 */
export function FitOneLine({
  as: Tag = 'h1',
  minPx = 20,
  className,
  children,
}: {
  as?: 'h1' | 'h2' | 'p' | 'span';
  minPx?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      const full = parseFloat(getComputedStyle(el).fontSize);
      if (!full || el.scrollWidth <= el.clientWidth) return;
      const scaled = Math.floor(full * (el.clientWidth / el.scrollWidth) * 10) / 10;
      el.style.fontSize = `${Math.max(minPx, scaled)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    void document.fonts?.ready.then(fit);
    return () => observer.disconnect();
  }, [children, minPx]);

  return (
    <Tag
      ref={(node: HTMLElement | null) => {
        ref.current = node;
      }}
      className={cn('min-w-0 overflow-hidden text-ellipsis whitespace-nowrap', className)}
    >
      {children}
    </Tag>
  );
}

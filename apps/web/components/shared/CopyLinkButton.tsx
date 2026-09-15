'use client';

// One copy-to-clipboard control, shared.
//
// There are nine hand-rolled copies of this in the app and they disagree on the
// thing that matters: most swallow a rejected clipboard write silently, so on a
// browser that blocks it the button looks like it worked and the person pastes
// nothing. The admin invite page is the exception, and its behaviour is the one
// copied here — SAY SO, and tell them what to do instead.
//
// New share links use this. The eight existing call sites are deliberately left
// alone: moving them is a separate change and would bury this one.

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from '@/components/icons';

type Props = {
  value: string;
  /** What the button says at rest. */
  label?: string;
  className?: string;
};

const COPIED_MS = 2000;

export function CopyLinkButton({ value, label = 'Copy link', className = '' }: Props) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = async () => {
    setFailed(false);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // Blocked, or no clipboard at all. Silence here is the failure mode this
      // component exists to remove.
      setFailed(true);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm text-content-primary transition-colors hover:bg-bg-elevated"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : label}
      </button>
      {failed ? (
        <p className="mt-2 text-xs text-status-error">
          Could not copy. Select the link and copy it by hand.
        </p>
      ) : null}
    </div>
  );
}

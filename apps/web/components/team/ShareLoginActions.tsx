'use client';

import { useCallback, useState } from 'react';
import { Check, Copy, Mail, MessageCircle } from 'lucide-react';
import {
  buildEmailShareUrl,
  buildLoginShareMessage,
  buildWhatsAppShareUrl,
} from '@/lib/team-logins';
import { openExternalUrl } from '@/lib/external-link';

type ShareLoginActionsProps = {
  url: string;
  workspaceName?: string | null;
  releaseTitle?: string | null;
  inviterName?: string | null;
  /** `full` shows the URL in a read-only field above the buttons (the
   * post-create step, where the link is the whole subject of the screen);
   * `inline` is the compact row used inside a list. */
  variant?: 'full' | 'inline';
};

/**
 * Copy / WhatsApp / Email for one sign-in link — shared by the compulsory
 * post-create step and the Settings list so the message a teammate receives
 * is identical whichever surface sent it.
 *
 * WhatsApp and Email carry the whole explanatory message from
 * buildLoginShareMessage, not a bare URL: an unexplained link from a music
 * manager reads like spam, and the person opening it needs to know they'll be
 * choosing their own password rather than waiting on one to arrive.
 *
 * Both go through openExternalUrl, so they open in the system browser inside
 * the Capacitor shell instead of trying to load a wa.me/mailto: in the
 * webview — the documented failure mode a bare target="_blank" anchor hits
 * there.
 */
export function ShareLoginActions({
  url,
  workspaceName,
  releaseTitle,
  inviterName,
  variant = 'inline',
}: ShareLoginActionsProps) {
  // No reset-on-url-change effect: a login's URL is immutable for the life of
  // its row, every list row is keyed by login id, and the tick clears itself
  // on a timer regardless. There is no path where this shows "Copied" for a
  // link the user didn't copy.
  const [copied, setCopied] = useState(false);

  const message = buildLoginShareMessage({ url, workspaceName, releaseTitle, inviterName });

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is unavailable on insecure origins and can be permission-
      // denied. Soft failure by design: the URL is rendered selectable in the
      // `full` variant and the WhatsApp/Email buttons still work.
    }
  }, [url]);

  const isFull = variant === 'full';

  return (
    <div className={isFull ? 'space-y-3' : 'space-y-2'}>
      {isFull ? (
        <input
          readOnly
          value={url}
          aria-label="Login link"
          onFocus={(event) => event.target.select()}
          className="w-full truncate rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 font-mono text-xs text-content-secondary"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="motion-focus inline-flex items-center gap-1.5 rounded-lg border border-stroke-subtle bg-bg-surface px-2.5 py-1.5 text-xs font-medium text-content-primary transition-colors hover:bg-bg-hover"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </button>

        <button
          type="button"
          onClick={() => void openExternalUrl(buildWhatsAppShareUrl(message))}
          className="motion-focus inline-flex items-center gap-1.5 rounded-lg border border-stroke-subtle bg-bg-surface px-2.5 py-1.5 text-xs font-medium text-content-primary transition-colors hover:bg-bg-hover"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          WhatsApp
        </button>

        <button
          type="button"
          onClick={() => void openExternalUrl(buildEmailShareUrl(message, workspaceName))}
          className="motion-focus inline-flex items-center gap-1.5 rounded-lg border border-stroke-subtle bg-bg-surface px-2.5 py-1.5 text-xs font-medium text-content-primary transition-colors hover:bg-bg-hover"
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Email
        </button>
      </div>
    </div>
  );
}

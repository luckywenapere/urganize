'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

type PackDownloadsProps = {
  token: string;
  /** Null when no file is attached to this slot yet. */
  versionId: string | null;
  downloadName: string;
};

/**
 * One track's download.
 *
 * Goes through our own route rather than exposing a storage URL, for two
 * reasons that both matter: the download has to be LOGGED (a receipt is the
 * feature), and the file has to arrive under its set-order name — a signed
 * Supabase URL would land as a UUID, which is exactly what makes a pack useless
 * in a dark booth.
 *
 * The signed URL is fetched on click rather than rendered into the page, so a
 * page left open overnight does not hold a wallet of live URLs, and so a view
 * is never mistaken for a download.
 */
export function PackDownloads({ token, versionId, downloadName }: PackDownloadsProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!versionId) {
    return (
      <span className="shrink-0 self-center text-xs opacity-40" title="No file attached yet">
        No file
      </span>
    );
  }

  const handleDownload = async () => {
    setIsWorking(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/pack/${encodeURIComponent(token)}/download?versionId=${encodeURIComponent(versionId)}`
      );
      if (!response.ok) {
        setFailed(true);
        return;
      }
      const body = await response.json();
      if (!body?.url) {
        setFailed(true);
        return;
      }
      // Navigating rather than using a download attribute: the file is on
      // another origin, where that attribute is ignored, so the name comes
      // from the signed URL's own content-disposition instead.
      window.location.href = body.url;
    } catch {
      setFailed(true);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleDownload()}
      disabled={isWorking}
      title={downloadName}
      aria-label={`Download ${downloadName}`}
      className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold transition-colors hover:border-white/40 disabled:opacity-50"
    >
      {isWorking ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Download className="h-3.5 w-3.5" aria-hidden />
      )}
      {failed ? 'Try again' : 'Get it'}
    </button>
  );
}

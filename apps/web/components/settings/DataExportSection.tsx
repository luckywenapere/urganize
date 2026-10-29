'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { buildExportFileName, type ExportFormat } from '@/lib/account-export';
import { shareOrDownloadTextFile } from '@/lib/share-file';
import { panelClass } from './panelClass';
import { feedbackErrorClass, feedbackSuccessClass } from './feedback';
import { getAccessToken } from './getAccessToken';
import { HelpTip } from '@/components/shared/HelpTip';

const EXPORT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DATA_EXPORT === 'true';

/**
 * "Export your data" — the section that makes an entitlement true.
 *
 * lib/entitlements.ts declares `data_export` on every tier and a test enforces
 * it, on the reasoning that a buyer who cannot get their catalogue back out has
 * been trapped rather than sold to. This is the control that honours it.
 *
 * It sits directly ABOVE DeleteAccountSection on purpose. The two are the same
 * conversation in the right order — take your data, then decide — and the
 * export deliberately covers the same scope deletion destroys, so a user
 * standing at the delete box has already been offered everything they are about
 * to lose.
 *
 * Two downloads rather than one archive: JSON is the complete record, CSV is
 * the file people actually open. A zip of eight CSVs would need an archiver
 * dependency to deliver strictly less.
 */
export function DataExportSection() {
  const [busyFormat, setBusyFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!EXPORT_ENABLED) return null;

  const handleExport = async (format: ExportFormat) => {
    setError('');
    setNotice('');
    setBusyFormat(format);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/account/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        // The body is a data file on success, so only parse JSON on failure.
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Could not build your export.');
      }

      const contents = await response.text();
      const outcome = await shareOrDownloadTextFile({
        contents,
        fileName: buildExportFileName(format, new Date().toISOString()),
        mimeType: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
        title: 'Your Urganize data',
      });

      // 'unsupported' is a real answer, not a failure to hide: an installed app
      // built before the share plugins landed cannot save a file at all, and a
      // silent no-op on this particular button would be the worst outcome in
      // the product.
      if (outcome === 'unsupported') {
        setError(
          'This app version cannot save files. Open my.urganize.app in your browser and export from there.'
        );
      } else if (outcome === 'downloaded') {
        setNotice('Your export has been downloaded.');
      } else if (outcome === 'shared') {
        setNotice('Your export is ready to save.');
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not build your export.'));
    } finally {
      setBusyFormat(null);
    }
  };

  const busy = busyFormat !== null;
  const buttonClass =
    'rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-semibold text-content-primary hover:border-brand disabled:opacity-55';

  return (
    <section id="export" className={`${panelClass} scroll-mt-4`}>
      <h2 className="mb-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        Your data
        <HelpTip helpKey="settings.export" />
      </h2>
      {/* Two paragraphs and six sentences until 2026-09-08. What is IN the
          export moved into the pullout; the platform line stays visible
          because it changes what the buttons below actually do. */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleExport('json')}
          disabled={busy}
          className={buttonClass}
        >
          {busyFormat === 'json' ? 'Preparing...' : 'Download everything'}
        </button>
        <button
          type="button"
          onClick={() => void handleExport('csv')}
          disabled={busy}
          className={buttonClass}
        >
          {busyFormat === 'csv' ? 'Preparing...' : 'Download activities'}
        </button>
      </div>
      {notice && <p role="status" className={`mt-4 ${feedbackSuccessClass}`}>{notice}</p>}
      {error && <p role="alert" className={`mt-4 ${feedbackErrorClass}`}>{error}</p>}
    </section>
  );
}

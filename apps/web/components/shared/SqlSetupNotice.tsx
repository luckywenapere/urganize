'use client';

import { useState } from 'react';

type SqlSetupNoticeProps = {
  title: string;
  description: string;
  sql: string;
};

export function SqlSetupNotice({ title, description, sql }: SqlSetupNoticeProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-[28px] border border-status-warning/35 bg-status-warning/10 p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.16em] text-status-warning">Setup Required</p>
      <h2 className="mt-2 text-2xl tracking-tight text-content-primary">{title}</h2>
      <p className="mt-3 text-sm text-content-secondary">{description}</p>
      <div className="mt-5 rounded-[22px] border border-stroke-default bg-bg-surface p-4">
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-content-secondary">{sql}</pre>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
        >
          {copied ? 'SQL Copied' : 'Copy SQL'}
        </button>
        <span className="self-center text-sm text-content-secondary">Run this once in your Supabase SQL editor.</span>
      </div>
    </div>
  );
}

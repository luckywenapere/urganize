'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { describeDate, todayKey } from '@/lib/opportunities';
import { GRANT_SUGGESTIONS_COPY, type GrantSuggestionView } from '@/lib/grants/suggestions';
import { useOpportunitiesStore } from '@/stores/useOpportunitiesStore';
import { loadGrantSuggestions } from './load-grant-suggestions';

// Suggested grants on Opportunities: this week's matches from the curated list.
// Shown only when NEXT_PUBLIC_FEATURE_GRANT_SUGGESTIONS is on and there is at
// least one. Add puts the grant in the team's list; Dismiss hides it for good.

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

export function GrantSuggestionsStrip() {
  const [suggestions, setSuggestions] = useState<GrantSuggestionView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reloadOpportunities = useOpportunitiesStore((state) => state.load);

  useEffect(() => {
    let live = true;
    void loadGrantSuggestions().then((result) => {
      // Offline or not allowed: the strip simply stays hidden.
      if (live && result.ok) setSuggestions(result.suggestions);
    });
    return () => {
      live = false;
    };
  }, []);

  async function act(item: GrantSuggestionView, action: 'add' | 'dismiss') {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const headers = await authHeaders();
      if (!headers) {
        setError('You are signed out. Sign in and try again.');
        return;
      }
      const response = await fetch(`/api/opportunities/grant-suggestions/${encodeURIComponent(item.id)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action }),
      });
      if (!response.ok && response.status !== 404) {
        const body = await response.json().catch(() => null);
        setError(typeof body?.error === 'string' ? body.error : 'Could not update that suggestion.');
        return;
      }
      // 404 means a teammate already handled it: drop it here too.
      setSuggestions((current) => current.filter((entry) => entry.id !== item.id));
      if (action === 'add') void reloadOpportunities({ force: true });
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusyId(null);
    }
  }

  if (suggestions.length === 0) return null;
  const today = todayKey();

  return (
    <section aria-label={GRANT_SUGGESTIONS_COPY.title} className="mb-6 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-content-primary">{GRANT_SUGGESTIONS_COPY.title}</h2>
        <p className="mt-1 text-sm text-content-secondary">{GRANT_SUGGESTIONS_COPY.description}</p>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-status-error">
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {suggestions.map((item) => (
          <li key={item.id} className="rounded-xl border border-stroke-default bg-bg-surface p-4">
            <p className="text-sm font-semibold text-content-primary">{item.programme}</p>
            <p className="text-sm text-content-secondary">{item.funder}</p>
            <p className="mt-2 text-xs text-content-tertiary">
              {[item.award, item.deadlineOn ? describeDate(item.deadlineOn, today) : GRANT_SUGGESTIONS_COPY.rolling, item.why]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {item.summary ? <p className="mt-2 text-sm text-content-secondary">{item.summary}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void act(item, 'add')}
                className="motion-focus rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand/90 disabled:opacity-50"
              >
                {GRANT_SUGGESTIONS_COPY.add}
              </button>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void act(item, 'dismiss')}
                className="motion-focus rounded-lg px-3 py-2 text-sm font-semibold text-content-secondary hover:text-content-primary disabled:opacity-50"
              >
                {GRANT_SUGGESTIONS_COPY.dismiss}
              </button>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="motion-focus ml-auto rounded-lg px-3 py-2 text-sm font-semibold text-content-secondary underline hover:text-content-primary"
              >
                {GRANT_SUGGESTIONS_COPY.read}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

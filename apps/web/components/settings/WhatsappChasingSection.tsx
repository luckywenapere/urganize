'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { panelClass } from './panelClass';
import { feedbackErrorClass, feedbackSuccessClass } from './feedback';

/**
 * WhatsApp chasing: UrgAns messages the owner of a task that is due or late, and
 * handles what they reply. Lives in the UrgAns segment next to the team brief.
 *
 * Toggles save as soon as they change. The AI choice saves on its own button,
 * because it carries a key and a half-typed key must never be sent.
 */

type Person = {
  userId: string;
  name: string;
  isCurrentUser: boolean;
  phoneMasked: string | null;
  status: 'none' | 'pending' | 'opted_in' | 'stopped';
};

type Settings = {
  enabled: boolean;
  chaseDayBefore: boolean;
  chaseDueDay: boolean;
  chaseOverdue: boolean;
  overdueEveryDays: number;
  tellOwnerOnDelay: boolean;
  remindPosts: boolean;
  aiMode: 'urganize' | 'own';
  aiProvider: 'openai' | 'anthropic' | 'openrouter' | 'custom' | null;
  aiBaseUrl: string | null;
  aiModel: string | null;
  hasKey: boolean;
};

type State = {
  canEdit: boolean;
  serverReady: boolean;
  keyStorageReady: boolean;
  settings: Settings;
  people: Person[];
};

const PROVIDER_LABELS: Record<NonNullable<Settings['aiProvider']>, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  custom: 'Other (OpenAI compatible)',
};

const STATUS_LABELS: Record<Person['status'], string> = {
  none: 'No number',
  pending: 'Waiting for YES',
  opted_in: 'On',
  stopped: 'Stopped',
};

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` };
}

export function WhatsappChasingSection() {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const [provider, setProvider] = useState<NonNullable<Settings['aiProvider']>>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace/whatsapp', { headers: await authHeaders() });
      if (!res.ok) {
        setLoadError('Could not load WhatsApp settings.');
        return;
      }
      const next = (await res.json()) as State;
      setState(next);
      setProvider(next.settings.aiProvider ?? 'openai');
      setBaseUrl(next.settings.aiBaseUrl ?? '');
      setModel(next.settings.aiModel ?? '');
    } catch {
      setLoadError('Could not load WhatsApp settings.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/workspace/whatsapp', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => null)) as { settings?: Settings; error?: string } | null;
      if (!res.ok || !payload?.settings) {
        setError(payload?.error || 'Could not save. Try again.');
        return false;
      }
      setState((prev) => (prev ? { ...prev, settings: payload.settings as Settings } : prev));
      return true;
    } catch {
      setError('Could not save. Check your connection and try again.');
      return false;
    }
  }, []);

  const sendNumber = async (person: Person) => {
    const phone = (phones[person.userId] || '').trim();
    if (!phone) {
      setError('Enter a WhatsApp number first.');
      return;
    }
    setBusyUser(person.userId);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/workspace/whatsapp/contacts', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: person.userId, phone }),
      });
      const payload = (await res.json().catch(() => null)) as { error?: string; warning?: string | null; sent?: boolean } | null;
      if (!res.ok) {
        setError(payload?.error || 'Could not save that number.');
        return;
      }
      if (payload?.warning) setError(payload.warning);
      else setNotice(payload?.sent ? `Sent ${person.name} a message asking them to reply YES.` : 'Saved.');
      setPhones((prev) => ({ ...prev, [person.userId]: '' }));
      await load();
    } finally {
      setBusyUser(null);
    }
  };

  const removeNumber = async (person: Person) => {
    setBusyUser(person.userId);
    setError('');
    try {
      await fetch('/api/workspace/whatsapp/contacts', {
        method: 'DELETE',
        headers: await authHeaders(),
        body: JSON.stringify({ userId: person.userId }),
      });
      await load();
    } finally {
      setBusyUser(null);
    }
  };

  const ownBody = () => ({
    aiProvider: provider,
    aiBaseUrl: provider === 'custom' ? baseUrl.trim() : null,
    aiModel: model.trim(),
  });

  const testKey = async () => {
    setTestResult(null);
    if (!apiKey.trim()) {
      setTestResult({ ok: false, text: 'Paste the key to test it.' });
      return;
    }
    setAiBusy(true);
    try {
      const res = await fetch('/api/workspace/whatsapp/test-key', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ provider, baseUrl: provider === 'custom' ? baseUrl.trim() : null, model: model.trim(), apiKey: apiKey.trim() }),
      });
      const payload = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      setTestResult(payload?.ok ? { ok: true, text: 'Key works' } : { ok: false, text: payload?.error || 'Could not test the key.' });
    } finally {
      setAiBusy(false);
    }
  };

  const saveOwnAi = async () => {
    setAiBusy(true);
    setTestResult(null);
    try {
      const saved = await patch({
        ...ownBody(),
        ...(apiKey.trim() ? { aiKey: apiKey.trim() } : {}),
        aiMode: 'own',
      });
      if (saved) {
        setApiKey('');
        setNotice('Your own AI will answer replies.');
      }
    } finally {
      setAiBusy(false);
    }
  };

  const chooseUrganizeAi = async () => {
    if (await patch({ aiMode: 'urganize' })) setNotice('Urganize AI will answer replies.');
  };

  const removeKey = async () => {
    if (await patch({ aiKey: null, aiMode: 'urganize' })) setNotice('Key removed. Urganize AI will answer replies.');
  };

  if (loadError) {
    return (
      <section id="whatsapp-chasing" className={`${panelClass} scroll-mt-4`}>
        <Heading />
        <p role="alert" className={`mt-4 ${feedbackErrorClass}`}>{loadError}</p>
      </section>
    );
  }

  if (!state) {
    return (
      <section id="whatsapp-chasing" className={`${panelClass} scroll-mt-4`}>
        <Heading />
        <div className="mt-4 space-y-3">
          <SkeletonBlock className="h-10 w-full" />
          <SkeletonBlock className="h-24 w-full" />
        </div>
      </section>
    );
  }

  const { settings, canEdit } = state;
  const toggle = (label: string, field: keyof Settings, hint?: string) => (
    <label className="flex items-start gap-3 py-2 text-sm text-content-primary">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0"
        checked={Boolean(settings[field])}
        disabled={!canEdit}
        onChange={(event) => void patch({ [field]: event.target.checked })}
      />
      <span>
        {label}
        {hint ? <span className="block text-xs text-content-tertiary">{hint}</span> : null}
      </span>
    </label>
  );

  return (
    <section id="whatsapp-chasing" className={`${panelClass} scroll-mt-4`}>
      <Heading />
      <p className="mt-2 max-w-prose text-sm text-content-secondary">
        AI messages the owner of a task on WhatsApp when it is due or late, and moves the date or marks it done from their reply.
      </p>

      {!state.serverReady ? (
        <p className="mt-3 max-w-prose text-sm text-content-tertiary">
          WhatsApp is not connected on the server yet, so nothing will send until it is.
        </p>
      ) : null}
      {error ? <p role="alert" className={`mt-4 ${feedbackErrorClass}`}>{error}</p> : null}
      {notice ? <p role="status" className={`mt-4 ${feedbackSuccessClass}`}>{notice}</p> : null}

      <div className="mt-5">
        {toggle('Chase task owners on WhatsApp', 'enabled')}
      </div>

      <h3 className="mt-6 text-sm font-medium text-content-primary">When to chase</h3>
      <div className="mt-1 divide-y divide-stroke-subtle">
        {toggle('The day before it is due', 'chaseDayBefore')}
        {toggle('On the due day, in the morning', 'chaseDueDay')}
        {toggle('When it is late', 'chaseOverdue')}
        {settings.chaseOverdue ? (
          <label className="flex items-center gap-3 py-2 text-sm text-content-primary">
            <span className="pl-7">Chase a late task every</span>
            <select
              className="motion-focus rounded-lg border border-stroke-control bg-bg-surface px-2 py-1 text-sm"
              value={settings.overdueEveryDays}
              disabled={!canEdit}
              onChange={(event) => void patch({ overdueEveryDays: Number(event.target.value) })}
            >
              {[1, 2, 3, 7].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'day' : `${n} days`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {toggle('Tell me when someone moves a date or says it is not theirs', 'tellOwnerOnDelay')}
        {/* Posting plan (2026-10-27): on the day, for posts they own. */}
        {toggle('Remind people to post, on the day', 'remindPosts')}
      </div>
      <p className="mt-2 text-xs text-content-tertiary">
        Messages go out around 08:00 Lagos time. Nothing sends between 21:00 and 08:00, and nobody gets more than one chase a day.
      </p>

      <h3 className="mt-8 text-sm font-medium text-content-primary">People</h3>
      <p className="mt-1 max-w-prose text-xs text-content-tertiary">
        Nobody is messaged until they reply YES to one welcome message. They can reply STOP at any time.
      </p>
      <ul className="mt-2 divide-y divide-stroke-subtle">
        {state.people.map((person) => (
          <li key={person.userId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm text-content-primary">
                {person.name}
                {person.isCurrentUser ? ' (you)' : ''}
              </p>
              <p className="text-xs text-content-tertiary">
                {STATUS_LABELS[person.status]}
                {person.phoneMasked ? ` · ${person.phoneMasked}` : ''}
              </p>
            </div>
            {canEdit ? (
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  inputMode="tel"
                  aria-label={`WhatsApp number for ${person.name}`}
                  placeholder="0803 123 4567"
                  value={phones[person.userId] || ''}
                  onChange={(event) => setPhones((prev) => ({ ...prev, [person.userId]: event.target.value }))}
                  className="motion-focus w-40 rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm text-content-primary placeholder:text-content-tertiary"
                />
                <button
                  type="button"
                  disabled={busyUser === person.userId}
                  onClick={() => void sendNumber(person)}
                  className="motion-focus rounded-lg border border-stroke-default px-3 py-2 text-sm text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                >
                  {person.status === 'none' ? 'Send welcome' : 'Change number'}
                </button>
                {person.status !== 'none' ? (
                  <button
                    type="button"
                    disabled={busyUser === person.userId}
                    onClick={() => void removeNumber(person)}
                    className="motion-focus rounded-lg px-2 py-2 text-xs text-content-tertiary hover:text-content-secondary disabled:opacity-60"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-sm font-medium text-content-primary">Who answers replies</h3>
      <div className="mt-2 space-y-2">
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${settings.aiMode === 'urganize' ? 'border-brand' : 'border-stroke-default'}`}>
          <input
            type="radio"
            name="whatsapp-ai"
            className="mt-0.5"
            checked={settings.aiMode === 'urganize'}
            disabled={!canEdit}
            onChange={() => void chooseUrganizeAi()}
          />
          <span>
            <span className="block font-medium text-content-primary">Urganize AI</span>
            <span className="block text-content-secondary">Nothing to set up.</span>
          </span>
        </label>

        <div className={`rounded-lg border p-3 text-sm ${settings.aiMode === 'own' ? 'border-brand' : 'border-stroke-default'}`}>
          <p className="font-medium text-content-primary">Bring your own AI</p>
          <p className="text-content-secondary">Use your own key. You pay the AI company directly.</p>
          {canEdit ? (
            state.keyStorageReady ? (
              <div className="mt-3 space-y-2">
                <select
                  aria-label="AI provider"
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as typeof provider)}
                  className="motion-focus w-full rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm"
                >
                  {(Object.keys(PROVIDER_LABELS) as Array<keyof typeof PROVIDER_LABELS>).map((key) => (
                    <option key={key} value={key}>
                      {PROVIDER_LABELS[key]}
                    </option>
                  ))}
                </select>
                {provider === 'custom' ? (
                  <input
                    type="url"
                    aria-label="AI address"
                    placeholder="https://api.example.com/v1"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    className="motion-focus w-full rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm placeholder:text-content-tertiary"
                  />
                ) : null}
                <input
                  type="text"
                  aria-label="Model"
                  placeholder="Model, for example gpt-4o-mini"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  className="motion-focus w-full rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm placeholder:text-content-tertiary"
                />
                <input
                  type="password"
                  autoComplete="off"
                  aria-label="API key"
                  placeholder={settings.hasKey ? 'A key is saved. Paste a new one to replace it.' : 'API key'}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  className="motion-focus w-full rounded-lg border border-stroke-control bg-bg-surface px-3 py-2 text-sm placeholder:text-content-tertiary"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void testKey()}
                    className="motion-focus rounded-lg border border-stroke-default px-3 py-2 text-sm text-content-primary hover:bg-bg-hover disabled:opacity-60"
                  >
                    Test key
                  </button>
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void saveOwnAi()}
                    className="motion-focus rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                  >
                    Use my AI
                  </button>
                  {settings.hasKey ? (
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={() => void removeKey()}
                      className="motion-focus rounded-lg px-2 py-2 text-xs text-content-tertiary hover:text-content-secondary disabled:opacity-60"
                    >
                      Remove key
                    </button>
                  ) : null}
                  {testResult ? (
                    <span role="status" className={`text-xs ${testResult.ok ? 'text-status-success' : 'text-status-error'}`}>
                      {testResult.text}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-content-tertiary">
                  Stored encrypted and used only for this team&apos;s WhatsApp replies. If the key fails, chases still go out and replies fall back to Urganize AI.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-content-tertiary">Saving your own key is not switched on for this server yet.</p>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Heading() {
  return (
    <h2 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
      WhatsApp chasing
    </h2>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { MessageCircle } from '@/components/icons';
import { loadBriefPrefs, type BriefPrefsView } from '@/lib/chappi/brief-answer-client';
import { shortDayLabel } from '@/lib/chappi/morning-brief';
import { SettingRow, settingRowButtonClass } from './SettingRow';

// The brief's daily question in Settings (#1314, mock
// docs/mocks/brief-daily-question, screen 4): the switch for the questions,
// and every answer the person gave, each with Clear. Nothing it learned is
// hidden. Shown under the Morning brief row while the brief is on.

export function BriefQuestionsSection() {
  const [view, setView] = useState<BriefPrefsView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void loadBriefPrefs().then((result) => {
      if (!live) return;
      if (result.ok) setView(result.view);
      else setError(result.error);
    });
    return () => {
      live = false;
    };
  }, []);

  const change = async (key: string, body: { questionsOn?: boolean; clear?: string }) => {
    setBusy(key);
    setError('');
    const result = await loadBriefPrefs(body);
    setBusy(null);
    if (result.ok) setView(result.view);
    else setError(result.error);
  };

  // Nothing is claimed until the settings arrive: an "on" shown while loading
  // would be wrong for anyone who turned the questions off.
  const questionsOn = view?.questionsOn ?? null;

  return (
    <>
      <SettingRow
        icon={<MessageCircle className={`h-4 w-4 ${questionsOn ? 'text-brand' : 'text-content-tertiary'}`} aria-hidden="true" />}
        title="A question each day"
        description={
          questionsOn === null
            ? 'Your brief may end with one short question, so it fits how you work.'
            : questionsOn
              ? 'Your brief may end with one short question, so it fits how you work. Your answers are listed below.'
              : 'No questions in your brief. Your answers below still shape it.'
        }
        action={
          <button
            type="button"
            disabled={!view || busy !== null}
            onClick={() => void change('switch', { questionsOn: !questionsOn })}
            className={settingRowButtonClass(questionsOn !== false)}
          >
            {questionsOn === null ? 'Loading…' : busy === 'switch' ? 'Working…' : questionsOn ? 'Turn off' : 'Turn on'}
          </button>
        }
        error={error}
      />
      {view && view.answers.length > 0 ? (
        <div className="py-4 last:pb-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-content-tertiary">
            What you told the Assistant
          </p>
          <ul className="mt-2 divide-y divide-stroke-subtle rounded-xl border border-stroke-default">
            {view.answers.map((line) => (
              <li key={line.key} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-content-secondary">{line.label}</p>
                  <p className="truncate text-sm font-medium text-content-primary">{line.value}</p>
                </div>
                <span className="shrink-0 text-xs text-content-tertiary">{shortDayLabel(line.at)}</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void change(line.key, { clear: line.key })}
                  aria-label={`Clear ${line.label.toLowerCase()}`}
                  className="motion-focus inline-flex min-h-10 shrink-0 items-center rounded-md px-2 text-sm font-medium text-content-secondary hover:bg-bg-hover disabled:opacity-60"
                >
                  {busy === line.key ? 'Clearing…' : 'Clear'}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-content-tertiary">
            A cleared answer may be asked again on a later morning.
          </p>
        </div>
      ) : null}
    </>
  );
}

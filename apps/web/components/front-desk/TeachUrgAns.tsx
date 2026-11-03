'use client';

// Screen 12, Teach UrgAns (curator). Answer once; UrgAns answers artists from
// exactly this. Prefilled from the curator's page where we can ("From your
// page"). One primary action: Save. The desktop side shows what artists will
// see, run through the REAL answer engine on the terms being edited.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { answerDeskQuestion } from '@/lib/front-desk/answer';
import { formatNaira } from '@/lib/front-desk/format';
import { DESK_LIMITS, hasDeskFacts, parseDeskTerms } from '@/lib/front-desk/terms';
import type { DeskService, DeskTerms } from '@/lib/front-desk/types';
import { deskFetch } from '@/lib/front-desk/client';
import { SAMPLE_CURATOR, SAMPLE_TERMS } from '@/lib/front-desk/sample';
import { AnswerBubble, Banner, DeskBar, DeskSkeleton, QuestionBubble, Toggle, UrgAnsLabel, cx, initialsOf, useWide } from './parts';
import s from './desk.module.css';

type FromPage = { services: boolean; genres: boolean; timing: boolean };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAMPLE_KEY = 'urganize.frontDesk.sampleTerms.v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const newService = (index: number): DeskService => ({ id: `svc-new-${Date.now().toString(36)}-${index}`, name: '', summary: '', includes: [], rateNaira: null });

function ChipList({
  label,
  items,
  checked,
  onChange,
  max,
  maxLength,
}: {
  label: string;
  items: string[];
  checked?: boolean;
  onChange: (items: string[]) => void;
  max: number;
  maxLength: number;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const commit = () => {
    const value = draft.replace(/\s+/g, ' ').trim().slice(0, maxLength);
    if (value && !items.some((item) => item.toLowerCase() === value.toLowerCase())) onChange([...items, value]);
    setDraft('');
    setAdding(false);
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') {
      setDraft('');
      setAdding(false);
    }
  };
  return (
    <div className={cx(s.rows, s.chips)}>
      {items.map((item) => (
        <span key={item} className={cx(s.chip, checked && s.chipOn)}>
          {checked ? (
            <span className={s.tick} aria-hidden="true">
              ✓
            </span>
          ) : null}
          {item}
          <button type="button" className={s.chipRemove} aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((other) => other !== item))}>
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          className={s.chipInput}
          value={draft}
          maxLength={maxLength}
          aria-label={`Add to ${label}`}
          placeholder="Type, then Enter"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
        />
      ) : items.length < max ? (
        <button type="button" className={cx(s.chip, s.chipAdd)} onClick={() => setAdding(true)}>
          + Add
        </button>
      ) : null}
    </div>
  );
}

function ServiceEditor({
  service,
  onChange,
  onDone,
  onRemove,
}: {
  service: DeskService;
  onChange: (next: DeskService) => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  const [rate, setRate] = useState(service.rateNaira === null ? '' : String(service.rateNaira));
  const [includes, setIncludes] = useState(service.includes.join(', '));
  return (
    <div className={s.rowEdit}>
      <label className={s.field}>
        <span className={s.fieldLabel}>Service</span>
        <input
          autoFocus
          className={s.input}
          value={service.name}
          maxLength={DESK_LIMITS.serviceName}
          placeholder="Playlist placement"
          onChange={(event) => onChange({ ...service, name: event.target.value })}
        />
      </label>
      <label className={s.field}>
        <span className={s.fieldLabel}>One line artists will read</span>
        <input
          className={s.input}
          value={service.summary}
          maxLength={DESK_LIMITS.serviceSummary}
          placeholder="1 week on New Music Friday"
          onChange={(event) => onChange({ ...service, summary: event.target.value })}
        />
      </label>
      <label className={s.field}>
        <span className={s.fieldLabel}>What&rsquo;s included, comma between each</span>
        <input
          className={s.input}
          value={includes}
          placeholder="Placement, 1 IG story"
          onChange={(event) => {
            setIncludes(event.target.value);
            onChange({
              ...service,
              includes: event.target.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, DESK_LIMITS.includes),
            });
          }}
        />
      </label>
      <label className={s.field}>
        <span className={s.fieldLabel}>Rate (₦)</span>
        <input
          className={s.input}
          inputMode="numeric"
          value={rate}
          placeholder="25000"
          onChange={(event) => {
            const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 9);
            setRate(digits);
            onChange({ ...service, rateNaira: digits ? Number(digits) : null });
          }}
        />
      </label>
      <div className={s.editActions}>
        <button type="button" className={s.linkBtn} style={{ color: 'var(--fd-dim)' }} onClick={onRemove}>
          Remove
        </button>
        <button type="button" className={cx(s.btn, s.quiet, s.small)} onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

export function TeachUrgAns({ mode }: { mode: 'curator' | 'sample' }) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [curatorName, setCuratorName] = useState(mode === 'sample' ? SAMPLE_CURATOR : '');
  const [terms, setTerms] = useState<DeskTerms>(SAMPLE_TERMS);
  const [enabled, setEnabled] = useState(true);
  const [fromPage, setFromPage] = useState<FromPage>({ services: false, genres: false, timing: false });
  const [save, setSave] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [ruleDraft, setRuleDraft] = useState<string | null>(null);
  const savedOnce = useRef(false);
  const wide = useWide();

  const load = async () => {
    setLoadError(false);
    if (mode === 'sample') {
      try {
        const stored = window.localStorage.getItem(SAMPLE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as { terms?: unknown; enabled?: unknown };
          setTerms(parseDeskTerms(parsed.terms));
          setEnabled(parsed.enabled !== false);
        }
      } catch {
        /* a bad local copy just falls back to the sample */
      }
      setFromPage({ services: true, genres: true, timing: false });
      setLoaded(true);
      return;
    }
    const result = await deskFetch<{ curatorName: string; enabled: boolean; terms: DeskTerms; fromPage: { genres: boolean; timing: boolean }; saved: boolean }>(
      '/api/front-desk/terms'
    );
    if (!result.ok) {
      setLoadError(true);
      setLoaded(true);
      return;
    }
    setCuratorName(result.data.curatorName);
    setTerms(parseDeskTerms(result.data.terms));
    setEnabled(result.data.enabled);
    setFromPage({ services: false, ...result.data.fromPage });
    savedOnce.current = result.data.saved;
    setLoaded(true);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const ready = hasDeskFacts(terms);
  const isOn = enabled && ready;

  const update = (next: DeskTerms) => {
    setTerms(next);
    if (save === 'saved' || save === 'error') setSave('idle');
  };

  const onSave = async () => {
    if (!ready) return;
    setEditing(null);
    setSave('saving');
    setSaveError('');
    const clean = parseDeskTerms(terms);
    if (mode === 'sample') {
      try {
        window.localStorage.setItem(SAMPLE_KEY, JSON.stringify({ terms: clean, enabled }));
      } catch {
        /* private mode: the sample still works for this visit */
      }
      setTerms(clean);
      setSave('saved');
      return;
    }
    const result = await deskFetch<{ terms: DeskTerms; enabled: boolean }>('/api/front-desk/terms', {
      method: 'PUT',
      body: JSON.stringify({ terms: clean, enabled }),
    });
    if (!result.ok) {
      setSaveError(result.error);
      setSave('error');
      return;
    }
    setTerms(parseDeskTerms(result.data.terms));
    savedOnce.current = true;
    setSave('saved');
  };

  // What artists will see: one real answer from the engine on these terms.
  const preview = useMemo(() => {
    if (!ready) return null;
    const extra = terms.services.slice(1).flatMap((service) => service.includes.filter((inc) => !terms.services[0].includes.includes(inc)));
    const question = extra[0] ? `Is ${/^\d/.test(extra[0]) ? extra[0].replace(/^\d+\s*/, 'the ') : extra[0]} included?` : terms.send.length ? 'What should I send?' : 'How much is it?';
    const result = answerDeskQuestion({ curatorName: curatorName || 'You', terms, pitch: null }, question);
    return result && result.kind === 'answer' ? { question, answer: result } : null;
  }, [curatorName, ready, terms]);

  if (!loaded) {
    return (
      <div className={cx(s.desk, s.ambient)}>
        <DeskBar context={curatorName || 'AI'} />
        <DeskSkeleton />
      </div>
    );
  }

  const primaryLabel = save === 'saving' ? 'Saving…' : save === 'error' ? 'Try again' : 'Save';
  const dock = (
    <div className={s.dock}>
      {save === 'saved' ? (
        <button type="button" className={cx(s.btn, s.quiet, s.block100)} onClick={() => setSave('idle')} aria-live="polite">
          Saved ✓
        </button>
      ) : (
        <button type="button" className={cx(s.btn, s.primary, s.block100)} disabled={!ready || save === 'saving'} onClick={() => void onSave()}>
          {primaryLabel}
        </button>
      )}
      <div className={cx(s.meta, s.dockCap)}>AI never promises beyond this</div>
    </div>
  );

  const rule = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, DESK_LIMITS.rule);
  const isNew = (addedAt?: string | null) => Boolean(addedAt && Date.now() - Date.parse(addedAt) < WEEK_MS);

  return (
    <div className={cx(s.desk, s.ambient)}>
      <DeskBar
        context={curatorName || 'Curator'}
        right={
          <span className={s.logo} style={{ width: 28, height: 28, fontSize: 7 }} aria-hidden="true">
            {initialsOf(curatorName)}
          </span>
        }
      />
      <div className={s.wrap}>
        <div className={cx(s.layout, s.layoutTeach)}>
          <main>
            <UrgAnsLabel
              right={
                <Link href="/curator/front-desk/inbox" className={s.linkBtn} style={{ fontSize: 13, minHeight: 32 }}>
                  Questions ›
                </Link>
              }
            />
            <h1 className={cx(s.display, s.title)}>Teach AI</h1>
            <p className={s.sub}>Answer once. AI answers artists for you.</p>
            {mode === 'sample' ? (
              <p className={s.meta} style={{ marginTop: 12, color: 'var(--fd-faint)' }}>
                Sample curator · changes stay on this device
              </p>
            ) : null}

            {loadError ? (
              <Banner tone="error" title="Couldn't load your terms.">
                <button type="button" className={s.linkBtn} style={{ minHeight: 0 }} onClick={() => void load()}>
                  Try again
                </button>
              </Banner>
            ) : null}
            {save === 'saved' ? (
              <Banner tone="ok" title="Saved.">
                {isOn ? 'AI is answering for you.' : 'AI is off. Artists ask you directly.'}
              </Banner>
            ) : null}
            {save === 'error' ? (
              <Banner tone="error" title="Couldn't save.">
                {saveError && saveError !== 'Something went wrong.' ? saveError : 'Your answers are kept here.'}
              </Banner>
            ) : null}

            <div className={s.rows} style={{ marginTop: 24 }}>
              <div className={s.row} style={{ minHeight: 76 }}>
                <div className={s.grow}>
                  <div className={s.t} style={{ fontSize: 16 }} id="fd-toggle-label">
                    Let AI answer artists for me
                  </div>
                  <div className={s.s}>{ready ? 'Only from this page and each pitch.' : 'Add one service to turn this on.'}</div>
                </div>
                <Toggle
                  on={isOn}
                  disabled={!ready}
                  label="Let AI answer artists for me"
                  onChange={(next) => {
                    setEnabled(next);
                    if (save === 'saved') setSave('idle');
                  }}
                />
              </div>
            </div>

            <section className={s.block} aria-labelledby="fd-services">
              <div className={s.blockHead}>
                <h2 className={s.meta} id="fd-services">
                  Services
                </h2>
                {fromPage.services && terms.services.length ? <span className={s.from}>From your page</span> : null}
              </div>
              <div className={s.rows}>
                {terms.services.map((service, index) =>
                  editing === service.id ? (
                    <ServiceEditor
                      key={service.id}
                      service={service}
                      onChange={(next) => update({ ...terms, services: terms.services.map((item, i) => (i === index ? next : item)) })}
                      onDone={() => {
                        if (!service.name.trim()) update({ ...terms, services: terms.services.filter((_, i) => i !== index) });
                        setEditing(null);
                      }}
                      onRemove={() => {
                        update({ ...terms, services: terms.services.filter((_, i) => i !== index) });
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <button key={service.id} type="button" className={s.row} onClick={() => setEditing(service.id)} aria-label={`Edit ${service.name}`}>
                      <div className={s.grow}>
                        <div className={s.t}>{service.name}</div>
                        {service.summary || service.includes.length ? <div className={s.s}>{service.summary || service.includes.join(' + ')}</div> : null}
                      </div>
                      <span className={s.num}>{formatNaira(service.rateNaira) || 'Add rate'}</span>
                      <span className={s.chev} aria-hidden="true">
                        ›
                      </span>
                    </button>
                  )
                )}
                {terms.services.length < DESK_LIMITS.services ? (
                  <button
                    type="button"
                    className={s.row}
                    onClick={() => {
                      const next = newService(terms.services.length);
                      update({ ...terms, services: [...terms.services, next] });
                      setEditing(next.id);
                    }}
                  >
                    <div className={cx(s.grow, s.addRow)}>+ Add a service</div>
                    {!terms.services.length ? <span className={s.meta}>What&rsquo;s included · rate</span> : null}
                  </button>
                ) : null}
              </div>
            </section>

            {ready ? (
              <>
                <section className={s.block} aria-labelledby="fd-timing">
                  <div className={s.blockHead}>
                    <h2 className={s.meta} id="fd-timing">
                      Timing
                    </h2>
                    {fromPage.timing ? <span className={s.from}>From your page</span> : null}
                  </div>
                  <div className={s.rows}>
                    {(
                      [
                        ['repliesWithinDays', 'Replies within', 'days'],
                        ['bookAheadDays', 'Book ahead', 'days'],
                      ] as const
                    ).map(([key, label, unit]) => (
                      <label key={key} className={s.row}>
                        <span className={cx(s.grow, s.s)}>{label}</span>
                        <input
                          className={cx(s.input, s.inputNum)}
                          inputMode="numeric"
                          aria-label={`${label}, ${unit}`}
                          value={terms.timing[key] ?? ''}
                          placeholder="–"
                          onChange={(event) => {
                            const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 3);
                            update({ ...terms, timing: { ...terms.timing, [key]: digits ? Number(digits) : null } });
                          }}
                        />
                        <span className={s.num} style={{ width: 36 }}>
                          {unit}
                        </span>
                      </label>
                    ))}
                    {(
                      [
                        ['startsOn', 'Starts on', 'Fridays'],
                        ['runsFor', 'Runs for', '1 week'],
                      ] as const
                    ).map(([key, label, placeholder]) => (
                      <label key={key} className={s.row}>
                        <span className={cx(s.grow, s.s)}>{label}</span>
                        <input
                          className={cx(s.input, s.inputNum)}
                          style={{ width: 128 }}
                          aria-label={label}
                          maxLength={DESK_LIMITS.phrase}
                          value={terms.timing[key] ?? ''}
                          placeholder={placeholder}
                          onChange={(event) => update({ ...terms, timing: { ...terms.timing, [key]: event.target.value || null } })}
                        />
                      </label>
                    ))}
                  </div>
                </section>

                <section className={s.block} aria-labelledby="fd-send">
                  <div className={s.blockHead}>
                    <h2 className={s.meta} id="fd-send">
                      What to send
                    </h2>
                  </div>
                  <ChipList label="What to send" checked items={terms.send} max={DESK_LIMITS.send} maxLength={DESK_LIMITS.sendItem} onChange={(send) => update({ ...terms, send })} />
                </section>

                <section className={s.block} aria-labelledby="fd-genres">
                  <div className={s.blockHead}>
                    <h2 className={s.meta} id="fd-genres">
                      Genres I take
                    </h2>
                    {fromPage.genres && terms.genres.length ? <span className={s.from}>From your page</span> : null}
                  </div>
                  <ChipList label="Genres" items={terms.genres} max={DESK_LIMITS.genres} maxLength={DESK_LIMITS.genre} onChange={(genres) => update({ ...terms, genres })} />
                </section>

                <section className={s.block} aria-labelledby="fd-rules">
                  <div className={s.blockHead}>
                    <h2 className={s.meta} id="fd-rules">
                      House rules
                    </h2>
                  </div>
                  <div className={s.rows}>
                    {terms.rules.map((item) => (
                      <div key={item.id} className={s.row}>
                        <div className={s.grow}>
                          {item.text}
                          {item.learned && isNew(item.addedAt) ? <span className={cx(s.pill, s.pillOn, s.newTag)}>New</span> : null}
                        </div>
                        <button
                          type="button"
                          className={s.chipRemove}
                          aria-label={`Remove rule: ${item.text}`}
                          onClick={() => update({ ...terms, rules: terms.rules.filter((other) => other.id !== item.id) })}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {ruleDraft !== null ? (
                      <div className={s.rowEdit}>
                        <input
                          autoFocus
                          className={s.input}
                          value={ruleDraft}
                          maxLength={DESK_LIMITS.rule}
                          aria-label="New house rule"
                          placeholder="No stream guarantees"
                          onChange={(event) => setRuleDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              const text = rule(ruleDraft);
                              if (text) update({ ...terms, rules: [...terms.rules, { id: `rule-${Date.now().toString(36)}`, text }] });
                              setRuleDraft(null);
                            }
                            if (event.key === 'Escape') setRuleDraft(null);
                          }}
                        />
                        <div className={s.editActions}>
                          <button type="button" className={s.linkBtn} style={{ color: 'var(--fd-dim)' }} onClick={() => setRuleDraft(null)}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={cx(s.btn, s.quiet, s.small)}
                            onClick={() => {
                              const text = rule(ruleDraft);
                              if (text) update({ ...terms, rules: [...terms.rules, { id: `rule-${Date.now().toString(36)}`, text }] });
                              setRuleDraft(null);
                            }}
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    ) : terms.rules.length < DESK_LIMITS.rules ? (
                      <button type="button" className={s.row} onClick={() => setRuleDraft('')}>
                        <div className={cx(s.grow, s.addRow)}>+ Add a rule</div>
                      </button>
                    ) : null}
                  </div>
                </section>
              </>
            ) : null}

            {wide ? null : dock}
          </main>

          {wide ? (
          <aside className={s.side}>
            {preview ? (
              <div className={s.card}>
                <div className={s.meta}>Artists will see</div>
                <div className={s.qa}>
                  <QuestionBubble>{preview.question}</QuestionBubble>
                  <AnswerBubble answer={preview.answer} />
                </div>
              </div>
            ) : null}
            {dock}
          </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

'use client';

// Screens 13 + 15, artist side: "Ask about this pitch". UrgAns answers from
// this pitch's facts only, each answer with its source. When the facts do not
// cover it, it says so plainly, shows what is agreed now, and offers ONE action:
// ask the curator, as one clean question. Later unknowns join that open
// question, so the curator gets one message (decision 3).

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { answerDeskQuestion, agreedNowRows, suggestedDeskQuestions } from '@/lib/front-desk/answer';
import { cleanQuestion, draftQuestion, mergeOpenItems, normaliseQuestion, MAX_DESK_QUESTION_LENGTH } from '@/lib/front-desk/text';
import { formatDeskDay, firstName } from '@/lib/front-desk/format';
import { SAMPLE_ROLLOUT_FACTS } from '@/lib/front-desk/sample';
import type { DeskAnswer, DeskPitchStatus } from '@/lib/front-desk/types';
import { deskFetch } from '@/lib/front-desk/client';
import { AnswerBubble, DeskSkeleton, QuestionBubble, TypingBubble, UnsureBubble, UrgAnsLabel, cx, initialsOf } from './parts';
import s from './desk.module.css';

type Escalation = Extract<DeskAnswer, { kind: 'escalate' }>;
type Turn =
  | { id: number; q: string; state: 'loading' }
  | { id: number; q: string; state: 'answer'; answer: Extract<DeskAnswer, { kind: 'answer' }> }
  | { id: number; q: string; state: 'escalate'; answer: Escalation }
  | { id: number; q: string; state: 'joined'; repeat: boolean; full: boolean }
  | { id: number; q: string; state: 'error' };

type PitchView = {
  live: boolean;
  curatorName: string;
  pitch: { id: string; songTitle: string; artistName: string; playlistName: string; status: DeskPitchStatus };
  agreedNow: Array<{ label: string; value: string }>;
  suggestions: string[];
  openQuestion: { items: string[] } | null;
  answered: Array<{ items: string[]; answer: string | null; answeredAt: string | null }>;
};

const STATUS_LABEL: Record<DeskPitchStatus, string> = {
  new: 'Sent',
  listened: 'Opened',
  added: 'Added',
  passed: 'Passed',
  accepted: 'Accepted',
  live: 'Live',
};

const sampleView = (): PitchView => {
  const facts = SAMPLE_ROLLOUT_FACTS;
  const pitch = facts.pitch!;
  return {
    live: true,
    curatorName: facts.curatorName,
    pitch: { id: pitch.id, songTitle: pitch.songTitle, artistName: pitch.artistName, playlistName: pitch.agreed?.service || pitch.playlistName, status: pitch.status },
    agreedNow: agreedNowRows(facts),
    suggestions: suggestedDeskQuestions(facts),
    openQuestion: null,
    answered: [],
  };
};

export function AskAboutPitch({ pitchId }: { pitchId: string }) {
  const router = useRouter();
  const isSample = pitchId === 'sample';
  const [view, setView] = useState<PitchView | null>(isSample ? sampleView() : null);
  const [loadError, setLoadError] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [justSent, setJustSent] = useState(false);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    if (isSample) return;
    setLoadError(false);
    const result = await deskFetch<PitchView>(`/api/front-desk/pitches/${encodeURIComponent(pitchId)}`);
    if (!result.ok) {
      setLoadError(true);
      return;
    }
    setView(result.data);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchId]);

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [turns]);

  const curator = view?.curatorName || 'the curator';
  const openItems = view?.openQuestion?.items ?? [];

  const setOpenItems = (items: string[]) => setView((current) => (current ? { ...current, openQuestion: items.length ? { items } : null } : current));

  const ask = async (raw: string) => {
    const question = cleanQuestion(raw);
    if (!question || busy || !view) return;
    const id = nextId.current++;
    setInput('');
    setDraft(null);
    setJustSent(false);
    setBusy(true);
    setTurns((current) => [...current, { id, q: question, state: 'loading' }]);
    const settle = (turn: Turn) => setTurns((current) => current.map((item) => (item.id === id ? turn : item)));

    if (isSample) {
      await new Promise((resolve) => setTimeout(resolve, 420));
      const answer = answerDeskQuestion(SAMPLE_ROLLOUT_FACTS, question);
      if (!answer) settle({ id, q: question, state: 'error' });
      else if (answer.kind === 'answer') settle({ id, q: question, state: 'answer', answer });
      else if (openItems.length) {
        const merged = mergeOpenItems(
          openItems.map((text) => ({ text, norm: normaliseQuestion(text) })),
          { text: answer.draft, norm: normaliseQuestion(answer.draft) }
        );
        setOpenItems(merged.items.map((item) => item.text));
        settle({ id, q: question, state: 'joined', repeat: merged.repeatOf !== null, full: merged.full });
      } else settle({ id, q: question, state: 'escalate', answer });
      setBusy(false);
      return;
    }

    const result = await deskFetch<{ answer: DeskAnswer; joined?: { repeat: boolean; full: boolean; items: string[] } }>(
      `/api/front-desk/pitches/${encodeURIComponent(pitchId)}/ask`,
      { method: 'POST', body: JSON.stringify({ question }) }
    );
    setBusy(false);
    if (!result.ok) {
      settle({ id, q: question, state: 'error' });
      return;
    }
    const { answer, joined } = result.data;
    if (answer.kind === 'answer') settle({ id, q: question, state: 'answer', answer });
    else if (joined) {
      setOpenItems(joined.items);
      settle({ id, q: question, state: 'joined', repeat: joined.repeat, full: joined.full });
    } else settle({ id, q: question, state: 'escalate', answer });
  };

  const send = async () => {
    const text = draftQuestion(draft || '');
    if (!text || sending) return;
    setSending(true);
    setSendError('');
    if (isSample) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setOpenItems([...openItems, text]);
      setDraft(null);
      setSending(false);
      setJustSent(true);
      return;
    }
    const result = await deskFetch<{ openQuestion: { items: string[] }; repeat: boolean }>(`/api/front-desk/pitches/${encodeURIComponent(pitchId)}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ question: text }),
    });
    setSending(false);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    setOpenItems(result.data.openQuestion.items);
    setDraft(null);
    setJustSent(true);
  };

  if (loadError) {
    return (
      <div className={s.desk}>
        <div className={cx(s.wrap, s.narrow)}>
          <div className={s.card}>
            <UrgAnsLabel />
            <div className={s.qa}>
              <UnsureBubble lead="I can't load this pitch right now," rest="so I won't guess." />
            </div>
            <div className={s.btnRow}>
              <button type="button" className={cx(s.btn, s.quiet)} onClick={() => router.back()}>
                Back
              </button>
              <button type="button" className={cx(s.btn, s.primary)} onClick={() => void load()}>
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div className={s.desk}>
        <DeskSkeleton />
      </div>
    );
  }

  const lastEscalation = [...turns].reverse().find((turn) => turn.state === 'escalate') as Extract<Turn, { state: 'escalate' }> | undefined;
  const lastTurn = turns[turns.length - 1];
  const showAskCurator = Boolean(lastTurn && lastTurn.state === 'escalate' && draft === null && !openItems.length);
  const statusOn = ['accepted', 'added', 'live'].includes(view.pitch.status);

  const header = (
    <div>
      <button type="button" className={s.crumb} onClick={() => router.back()} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        ‹ <span>{view.pitch.songTitle}</span>
      </button>
      <div className={s.head}>
        <div className={s.logo} aria-hidden="true">
          {initialsOf(view.curatorName)}
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 className={cx(s.display, s.headTitle)}>{view.curatorName}</h1>
          <div className={s.sumline}>
            <span className={cx(s.pill, statusOn && s.pillOn)}>
              <span className={s.dot} aria-hidden="true" />
              {STATUS_LABEL[view.pitch.status]}
            </span>
            <span className={s.s}>{view.pitch.playlistName}</span>
          </div>
        </div>
      </div>
      {view.agreedNow.length ? (
        <div className={s.block} style={{ marginTop: 24 }}>
          <div className={s.rows}>
            {view.agreedNow.map((row) => (
              <div key={row.label} className={s.row}>
                <div className={cx(s.grow, s.s)}>{row.label}</div>
                <span className={s.num}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const card = !view.live ? (
    <section className={s.card} aria-label="AI">
      <UrgAnsLabel />
      <p className={s.aTxt} style={{ marginTop: 16 }}>
        <b>{view.curatorName} answers questions themselves.</b>
      </p>
    </section>
  ) : (
    <section className={s.card} aria-label="Ask AI about this pitch">
      <UrgAnsLabel />
      {!turns.length && !view.answered.length ? (
        <>
          <h2 className={cx(s.display, s.cardTitle)}>Ask about this pitch</h2>
          <div className={s.sugg}>
            {view.suggestions.map((suggestion) => (
              <button key={suggestion} type="button" className={s.suggBtn} onClick={() => void ask(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {view.answered.length || turns.length ? (
        <div className={s.qa} aria-live="polite">
          {view.answered.map((item, index) => (
            <div key={`answered-${index}`} style={{ display: 'contents' }}>
              {item.items.map((text) => (
                <QuestionBubble key={text}>{text}</QuestionBubble>
              ))}
              {item.answer ? (
                <AnswerBubble
                  answer={{
                    kind: 'answer',
                    intent: 'curator_reply',
                    lead: `${view.curatorName} said:`,
                    rest: `“${item.answer}”`,
                    source: { kind: 'thread', label: item.answeredAt ? `Their reply · ${formatDeskDay(item.answeredAt)}` : 'Their reply' },
                  }}
                />
              ) : null}
            </div>
          ))}
          {turns.map((turn) => (
            <div key={turn.id} style={{ display: 'contents' }}>
              <QuestionBubble>{turn.q}</QuestionBubble>
              {turn.state === 'loading' ? <TypingBubble label="Checking the pitch" /> : null}
              {turn.state === 'answer' ? <AnswerBubble answer={turn.answer} /> : null}
              {turn.state === 'escalate' ? <UnsureBubble lead={turn.answer.lead} rest={turn.answer.rest} /> : null}
              {turn.state === 'joined' ? (
                <UnsureBubble
                  lead={turn.repeat ? 'Already asked.' : turn.full ? "Your open question is full." : "That's not in the terms yet."}
                  rest={
                    turn.repeat
                      ? `It's in your open question to ${curator}.`
                      : turn.full
                        ? `${curator} will answer those first.`
                        : 'I added it to your open question, so they get one message.'
                  }
                />
              ) : null}
              {turn.state === 'error' ? <UnsureBubble lead="I can't load this pitch right now," rest="so I won't guess. Try again." /> : null}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      ) : null}

      {showAskCurator && lastEscalation ? (
        <>
          {lastEscalation.answer.agreedNow.length ? (
            <div className={cx(s.rows, s.inset, s.agreedMini)}>
              {lastEscalation.answer.agreedNow.map((row) => (
                <div key={row.label} className={s.row} style={{ minHeight: 48 }}>
                  <div className={cx(s.grow, s.s)}>{row.label} now</div>
                  <span className={s.num}>{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
          <button type="button" className={cx(s.btn, s.primary, s.block100)} style={{ marginTop: 16 }} onClick={() => setDraft(lastEscalation.answer.draft)}>
            Ask {curator}
          </button>
        </>
      ) : null}

      {draft !== null ? (
        <div className={s.openq}>
          <label className={s.meta} htmlFor="fd-draft">
            Your question to {curator}
          </label>
          <textarea
            id="fd-draft"
            className={s.textarea}
            value={draft}
            maxLength={MAX_DESK_QUESTION_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
          />
          {sendError ? (
            <p className={s.s} role="alert" style={{ marginTop: 8, color: 'var(--fd-red)' }}>
              {sendError}
            </p>
          ) : null}
          <div className={s.btnRow}>
            <button type="button" className={cx(s.btn, s.quiet)} onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="button" className={cx(s.btn, s.primary)} disabled={sending || !draftQuestion(draft)} onClick={() => void send()}>
              {sending ? 'Sending…' : 'Send question'}
            </button>
          </div>
        </div>
      ) : null}

      {openItems.length && draft === null ? (
        <div className={s.openq} aria-live="polite">
          <div className={s.openqHead}>
            <span className={s.meta}>{justSent ? 'Sent' : 'Open question'}</span>
            <span className={cx(s.pill, s.pillWait)}>
              <span className={s.dot} aria-hidden="true" />
              Waiting
            </span>
          </div>
          <ol>
            {openItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          {justSent ? (
            <p className={s.s} style={{ marginTop: 12 }}>
              {firstName(curator) || curator} gets it in today&rsquo;s round-up. The reply lands here.
            </p>
          ) : null}
        </div>
      ) : null}

      <form
        className={s.ask}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void ask(input);
        }}
      >
        <label htmlFor="fd-ask" className={s.srOnly}>
          Ask about this pitch
        </label>
        <input
          id="fd-ask"
          className={s.askInput}
          value={input}
          maxLength={MAX_DESK_QUESTION_LENGTH}
          placeholder="Ask anything"
          autoComplete="off"
          enterKeyHint="send"
          onChange={(event) => setInput(event.target.value)}
        />
        <button type="submit" className={cx(s.btn, s.primary, s.go)} disabled={!input.trim() || busy} aria-label="Ask">
          ↑
        </button>
      </form>
    </section>
  );

  return (
    <div className={s.desk} style={{ minHeight: 'auto' }}>
      <div className={s.wrap}>
        <div className={cx(s.layout, s.layoutAsk)}>
          <aside className={s.side}>{header}</aside>
          <main>
            {card}
            {view.live ? <div className={cx(s.meta, s.note)}>Answers come from this pitch only</div> : null}
            {isSample ? (
              <div className={cx(s.meta, s.note)} style={{ marginTop: 6 }}>
                Sample pitch
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

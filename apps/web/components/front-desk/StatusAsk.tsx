'use client';

// Screen 14, the public status link (no login) with "Ask a question". Reply stays
// the primary action; asking UrgAns is the quiet box under Agreed.
//
// Standalone status links (screens 8–9) are not built yet, so this renders the
// approved sample (Owambe Season by Ayo Kalu) for the flagged preview account
// only. When real links ship, the token scopes the visitor to ONE pitch and the
// same engine answers from that pitch's facts.

import { useState, type FormEvent } from 'react';
import { answerDeskQuestion, agreedNowRows } from '@/lib/front-desk/answer';
import { cleanQuestion, draftQuestion, MAX_DESK_QUESTION_LENGTH } from '@/lib/front-desk/text';
import { formatDeskDay } from '@/lib/front-desk/format';
import { SAMPLE_STATUS_FACTS, SAMPLE_STATUS_LATEST } from '@/lib/front-desk/sample';
import type { DeskAnswer } from '@/lib/front-desk/types';
import { AnswerBubble, DeskBar, QuestionBubble, UnsureBubble, cx } from './parts';
import s from './desk.module.css';

const facts = SAMPLE_STATUS_FACTS;
const pitch = facts.pitch!;

export function StatusAsk() {
  const [input, setInput] = useState('');
  const [turn, setTurn] = useState<{ q: string; answer: DeskAnswer } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [replied, setReplied] = useState(false);

  const agreed = agreedNowRows(facts);
  const steps = [
    { label: 'Submitted', date: formatDeskDay(pitch.sentAt).replace(/^\w+ /, ''), state: 'done' },
    { label: 'Accepted', date: formatDeskDay(pitch.statusAt).replace(/^\w+ /, ''), state: 'done' },
    { label: 'Starts', date: formatDeskDay(pitch.agreed?.startDate), state: 'now' },
    { label: 'Live', date: 'Next', state: 'next' },
  ] as const;

  const onAsk = (event: FormEvent) => {
    event.preventDefault();
    const question = cleanQuestion(input);
    if (!question) return;
    setInput('');
    setDraft(null);
    const answer = answerDeskQuestion(facts, question);
    if (answer) setTurn({ q: question, answer });
  };

  return (
    <div className={cx(s.desk, s.ambient)}>
      <DeskBar context="Pitch status" right={<span className={s.pill}>No login</span>} />
      <div className={cx(s.wrap, s.narrow)}>
        <div className={s.meta}>{facts.curatorName}</div>
        <h1 className={cx(s.display, s.title)}>{pitch.songTitle}</h1>
        <p className={s.sub} style={{ marginTop: 6 }}>
          {pitch.artistName} · {pitch.agreed?.service}
        </p>

        <ol className={cx(s.rows, s.steps)} aria-label="Pitch progress" style={{ listStyle: 'none' }}>
          {steps.map((step) => (
            <li key={step.label} className={cx(s.step, step.state === 'done' && s.stepDone, step.state === 'now' && s.stepNow)} aria-current={step.state === 'now' ? 'step' : undefined}>
              <span className={s.stepC} aria-hidden="true">
                {step.state === 'done' ? '✓' : ''}
              </span>
              <span className={s.stepL}>
                {step.label}
                <span className={s.stepD}>{step.date}</span>
              </span>
            </li>
          ))}
        </ol>

        <section className={s.block} aria-labelledby="fd-agreed">
          <div className={s.blockHead}>
            <h2 className={s.meta} id="fd-agreed">
              Agreed
            </h2>
            <span className={s.from}>Paid off-platform</span>
          </div>
          <div className={s.rows}>
            <div className={s.row}>
              <div className={cx(s.grow, s.s)}>Service</div>
              <span className={s.t}>{pitch.agreed?.service}</span>
            </div>
            {agreed.map((row) => (
              <div key={row.label} className={s.row}>
                <div className={cx(s.grow, s.s)}>{row.label}</div>
                <span className={s.num}>{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={s.block} aria-label="Ask a question">
          <div className={s.blockHead}>
            <h2 className={s.meta}>Ask a question</h2>
            <span className={cx(s.meta, s.urgansLabel)}>
              <span className={cx(s.glyph, s.glyphSm)} aria-hidden="true" />
              AI
            </span>
          </div>
          {turn ? (
            <div className={s.qa} style={{ marginTop: 12 }} aria-live="polite">
              <QuestionBubble>{turn.q}</QuestionBubble>
              {turn.answer.kind === 'answer' ? <AnswerBubble answer={turn.answer} /> : <UnsureBubble lead={turn.answer.lead} rest={turn.answer.rest} />}
            </div>
          ) : null}
          {turn && draft === null && !asked.length ? (
            <p className={s.s} style={{ marginTop: 12, fontSize: 14 }}>
              {turn.answer.kind === 'answer' ? 'Still unsure? ' : ''}
              <button type="button" className={s.linkBtn} onClick={() => setDraft(turn.answer.kind === 'escalate' ? turn.answer.draft : draftQuestion(turn.q))}>
                Ask {facts.curatorName} ›
              </button>
            </p>
          ) : null}
          {draft !== null ? (
            <div className={s.openq}>
              <label className={s.meta} htmlFor="fd-status-draft">
                Your question to {facts.curatorName}
              </label>
              <textarea id="fd-status-draft" className={s.textarea} value={draft} maxLength={MAX_DESK_QUESTION_LENGTH} onChange={(event) => setDraft(event.target.value)} />
              <div className={s.btnRow}>
                <button type="button" className={cx(s.btn, s.quiet)} onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={cx(s.btn, s.primary)}
                  disabled={!draftQuestion(draft)}
                  onClick={() => {
                    setAsked([...asked, draftQuestion(draft)]);
                    setDraft(null);
                  }}
                >
                  Send question
                </button>
              </div>
            </div>
          ) : null}
          {asked.length ? (
            <div className={s.openq} aria-live="polite">
              <div className={s.openqHead}>
                <span className={s.meta}>Sent</span>
                <span className={cx(s.pill, s.pillWait)}>
                  <span className={s.dot} aria-hidden="true" />
                  Waiting
                </span>
              </div>
              <ol>
                {asked.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
            </div>
          ) : null}
          <form className={s.ask} style={{ marginTop: 12 }} onSubmit={onAsk}>
            <label htmlFor="fd-status-ask" className={s.srOnly}>
              Ask a question
            </label>
            <input
              id="fd-status-ask"
              className={s.askInput}
              value={input}
              maxLength={MAX_DESK_QUESTION_LENGTH}
              placeholder="How long is it on the playlist?"
              autoComplete="off"
              enterKeyHint="send"
              onChange={(event) => setInput(event.target.value)}
            />
            <button type="submit" className={cx(s.btn, s.quiet, s.go)} disabled={!input.trim()} aria-label="Ask">
              ↑
            </button>
          </form>
        </section>

        <section className={s.block} aria-labelledby="fd-latest">
          <h2 className={s.meta} id="fd-latest" style={{ padding: '0 4px' }}>
            Latest
          </h2>
          <div className={s.latest}>
            <div className={s.openqHead}>
              <span className={s.meta}>{SAMPLE_STATUS_LATEST.from}</span>
              <span className={s.meta}>{SAMPLE_STATUS_LATEST.ago}</span>
            </div>
            <p style={{ marginTop: 6, fontSize: 16, lineHeight: 1.45 }}>{SAMPLE_STATUS_LATEST.text}</p>
          </div>
        </section>

        {reply !== null ? (
          <div className={s.openq}>
            <label className={s.meta} htmlFor="fd-reply">
              Reply to {facts.curatorName}
            </label>
            <textarea id="fd-reply" className={s.textarea} value={reply} onChange={(event) => setReply(event.target.value)} />
          </div>
        ) : null}
        <div className={s.dock}>
          {replied ? (
            <button type="button" className={cx(s.btn, s.quiet, s.block100)} disabled>
              Sent ✓
            </button>
          ) : (
            <button
              type="button"
              className={cx(s.btn, s.primary, s.block100)}
              disabled={reply !== null && !reply.trim()}
              onClick={() => {
                if (reply === null) setReply('');
                else if (reply.trim()) setReplied(true);
              }}
            >
              {reply === null ? 'Reply' : 'Send reply'}
            </button>
          )}
          <div className={cx(s.meta, s.dockCap)}>Replies also work from your email</div>
        </div>

        <a className={s.promo} href="https://urganize.app">
          <div className={s.grow}>
            <div className={s.t} style={{ fontSize: 14 }}>
              Plan your whole release on Urganize
            </div>
            <div className={s.s}>Pitches, posts and drop day in one plan.</div>
          </div>
          <span className={s.addRow} style={{ fontSize: 13 }}>
            Start ›
          </span>
        </a>
        <div className={cx(s.meta, s.note)}>Sample status link</div>
      </div>
    </div>
  );
}

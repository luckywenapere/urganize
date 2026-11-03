'use client';

// Screen 16, curator side. The inbox lists pitches with front desk activity:
// "1 question for you" in green, or a quiet "UrgAns answered 3". A pitch opens
// to a quiet row (what UrgAns answered, each with its source), ONE card for the
// real question, and Reply. After the reply UrgAns proposes a rule in the
// curator's own words; nothing joins their terms without the one tap.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { deskFetch } from '@/lib/front-desk/client';
import { firstName } from '@/lib/front-desk/format';
import { proposeRuleFromAnswer } from '@/lib/front-desk/terms';
import { SAMPLE_ANSWERED, SAMPLE_CURATOR, SAMPLE_INBOX, SAMPLE_OPEN_QUESTION, SAMPLE_ROLLOUT_FACTS } from '@/lib/front-desk/sample';
import type { DeskAnsweredItem, DeskOpenQuestion } from '@/lib/front-desk/types';
import { Banner, DeskBar, DeskSkeleton, SourceChip, UrgAnsLabel, cx, initialsOf, useWide } from './parts';
import { agreedNowRows } from '@/lib/front-desk/answer';
import s from './desk.module.css';

type InboxRow = { id: string; songTitle: string; artistName: string; service: string; openItems: number; answered: number };

function CuratorFrame({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className={cx(s.desk, s.ambient)}>
      <DeskBar
        context={name || 'Curator'}
        right={
          <span className={s.logo} style={{ width: 28, height: 28, fontSize: 7 }} aria-hidden="true">
            {initialsOf(name)}
          </span>
        }
      />
      {children}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function CuratorInbox({ mode, curatorName }: { mode: 'curator' | 'sample'; curatorName: string | null }) {
  const [rows, setRows] = useState<InboxRow[] | null>(mode === 'sample' ? SAMPLE_INBOX : null);
  const [error, setError] = useState(false);
  const name = mode === 'sample' ? SAMPLE_CURATOR : curatorName || '';

  const load = async () => {
    if (mode === 'sample') return;
    setError(false);
    const result = await deskFetch<{ pitches: InboxRow[] }>('/api/front-desk/inbox');
    if (!result.ok) setError(true);
    else setRows(result.data.pitches);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const waiting = rows?.filter((row) => row.openItems > 0).length ?? 0;
  return (
    <CuratorFrame name={name}>
      <div className={cx(s.wrap, s.narrow)}>
        <UrgAnsLabel
          right={
            <Link href="/curator/front-desk" className={s.linkBtn} style={{ fontSize: 13, minHeight: 32 }}>
              Your terms ›
            </Link>
          }
        />
        <h1 className={cx(s.display, s.title)}>{waiting ? plural(waiting, 'pitch needs you', 'pitches need you') : 'All answered'}</h1>
        <p className={s.sub}>{waiting ? 'Only the questions AI couldn’t answer.' : 'AI answered every question from your terms.'}</p>
        {mode === 'sample' ? (
          <p className={s.meta} style={{ marginTop: 12, color: 'var(--fd-faint)' }}>
            Sample curator
          </p>
        ) : null}
        {error ? (
          <Banner tone="error" title="Couldn't load your questions.">
            <button type="button" className={s.linkBtn} style={{ minHeight: 0 }} onClick={() => void load()}>
              Try again
            </button>
          </Banner>
        ) : null}
        {!rows && !error ? <DeskSkeleton /> : null}
        {rows && !rows.length ? (
          <div className={s.rows} style={{ marginTop: 24 }}>
            <div className={s.row}>
              <div className={cx(s.grow, s.s)}>No questions yet. When artists ask, they land here.</div>
            </div>
          </div>
        ) : null}
        {rows && rows.length ? (
          <div className={s.rows} style={{ marginTop: 24 }}>
            {rows.map((row) => {
              const clickable = mode === 'curator' || row.id === 'sample';
              const inner = (
                <>
                  <span className={s.art} style={{ width: 44, height: 44, borderRadius: 10 }} aria-hidden="true" />
                  <div className={s.grow}>
                    <div className={s.t}>{row.songTitle}</div>
                    <div className={s.s}>
                      {row.artistName}
                      {row.service ? ` · ${row.service}` : ''}
                    </div>
                  </div>
                  {row.openItems > 0 ? (
                    <span className={s.inboxCount}>{plural(row.openItems, 'question', 'questions')} for you</span>
                  ) : (
                    <span className={s.inboxQuiet}>AI answered {row.answered}</span>
                  )}
                  {clickable ? (
                    <span className={s.chev} aria-hidden="true">
                      ›
                    </span>
                  ) : null}
                </>
              );
              return clickable ? (
                <Link key={row.id} href={`/curator/front-desk/inbox/${row.id}`} className={s.row}>
                  {inner}
                </Link>
              ) : (
                <div key={row.id} className={s.row}>
                  {inner}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </CuratorFrame>
  );
}

type PitchDetail = {
  pitch: { id: string; songTitle: string; artistName: string; service: string; status: string };
  answered: DeskAnsweredItem[];
  openQuestion: DeskOpenQuestion | null;
  learn: DeskOpenQuestion | null;
};

const samplePitch = (): PitchDetail => ({
  pitch: { id: 'sample', songTitle: 'Honest', artistName: 'Kemi Ade', service: 'Playlist placement', status: 'accepted' },
  answered: SAMPLE_ANSWERED,
  openQuestion: SAMPLE_OPEN_QUESTION,
  learn: null,
});

export function CuratorPitch({ mode, curatorName, pitchId }: { mode: 'curator' | 'sample'; curatorName: string | null; pitchId: string }) {
  const isSample = mode === 'sample';
  const name = isSample ? SAMPLE_CURATOR : curatorName || '';
  const [detail, setDetail] = useState<PitchDetail | null>(isSample ? samplePitch() : null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [answered, setAnswered] = useState<{ question: DeskOpenQuestion; answer: string } | null>(null);
  const [rule, setRule] = useState('');
  const [decision, setDecision] = useState<'added' | 'once' | null>(null);
  const wide = useWide();

  const load = async () => {
    if (isSample) return;
    setError(false);
    const result = await deskFetch<PitchDetail>(`/api/front-desk/inbox/${encodeURIComponent(pitchId)}`);
    if (!result.ok) {
      setError(true);
      return;
    }
    setDetail(result.data);
    if (result.data.learn?.curatorAnswer) {
      setAnswered({ question: result.data.learn, answer: result.data.learn.curatorAnswer });
      setRule(result.data.learn.proposedRule || '');
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitchId, mode]);

  if (isSample && pitchId !== 'sample') {
    return (
      <CuratorFrame name={name}>
        <div className={cx(s.wrap, s.narrow)}>
          <p className={s.sub}>Only the sample pitch opens here.</p>
        </div>
      </CuratorFrame>
    );
  }

  if (error) {
    return (
      <CuratorFrame name={name}>
        <div className={cx(s.wrap, s.narrow)}>
          <Banner tone="error" title="Couldn't load this pitch.">
            <button type="button" className={s.linkBtn} style={{ minHeight: 0 }} onClick={() => void load()}>
              Try again
            </button>
          </Banner>
        </div>
      </CuratorFrame>
    );
  }
  if (!detail) {
    return (
      <CuratorFrame name={name}>
        <DeskSkeleton />
      </CuratorFrame>
    );
  }

  const artist = firstName(detail.pitch.artistName) || 'The artist';
  const open = answered ? null : detail.openQuestion;
  const agreedLine = isSample ? agreedNowRows(SAMPLE_ROLLOUT_FACTS).map((row) => (row.label === 'Starts' ? `Starts ${row.value}` : row.value)).join(' · ') : '';

  const sendReply = async () => {
    const text = reply.replace(/\s+/g, ' ').trim();
    if (!open || text.length < 2 || sending) return;
    setSending(true);
    setActionError('');
    if (isSample) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      setAnswered({ question: open, answer: text });
      setRule(proposeRuleFromAnswer(text));
      setSending(false);
      return;
    }
    const result = await deskFetch<{ question: DeskOpenQuestion }>(`/api/front-desk/inbox/${encodeURIComponent(pitchId)}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'answer', questionId: open.id, answer: text }),
    });
    setSending(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setAnswered({ question: result.data.question, answer: text });
    setRule(result.data.question.proposedRule || proposeRuleFromAnswer(text));
  };

  const decide = async (choice: 'added' | 'once') => {
    if (!answered || sending) return;
    setSending(true);
    setActionError('');
    if (isSample) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      setDecision(choice);
      setSending(false);
      return;
    }
    const result = await deskFetch<{ decision: 'added' | 'once' }>(`/api/front-desk/inbox/${encodeURIComponent(pitchId)}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'rule', questionId: answered.question.id, decision: choice, text: rule }),
    });
    setSending(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setDecision(result.data.decision);
  };

  const answeredRow = detail.answered.length ? (
    <>
      <button type="button" className={s.quietRow} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className={cx(s.glyph, s.glyphSm)} aria-hidden="true" />
        <span className={s.grow}>
          <b>AI answered {plural(detail.answered.length, 'question', 'questions')}</b>
        </span>
        <span className={s.chev} aria-hidden="true" style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 160ms' }}>
          ›
        </span>
      </button>
      {expanded ? (
        <div className={cx(s.rows, s.alist)}>
          {detail.answered.map((item, index) => (
            <div key={`${item.at}-${index}`} className={cx(s.row, s.alistRow)}>
              <span className={s.alistN}>{index + 1}</span>
              <div className={s.grow}>
                <div className={s.t} style={{ fontSize: 14.5 }}>
                  {item.question}
                </div>
                <div className={s.s} style={{ marginTop: 2 }}>
                  {item.answer}
                </div>
                <SourceChip source={item.source} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  ) : null;

  const action = open ? (
    <section className={s.esc} aria-labelledby="fd-esc">
      <div className={s.meta} id="fd-esc">
        <span className={s.urgansLabel}>
          <span className={cx(s.glyph, s.glyphSm)} aria-hidden="true" />
          {artist} asks · {plural(open.items.length, 'question', 'questions')}
        </span>
      </div>
      {open.items.length === 1 ? (
        <p className={s.escQ}>{open.items[0].text}</p>
      ) : (
        <ol className={cx(s.escQ, s.escList)}>
          {open.items.map((item) => (
            <li key={item.at + item.text}>{item.text}</li>
          ))}
        </ol>
      )}
      <label htmlFor="fd-reply" className={s.srOnly}>
        Reply to {artist}
      </label>
      <textarea id="fd-reply" className={s.textarea} placeholder={`Reply to ${artist}`} maxLength={600} value={reply} onChange={(event) => setReply(event.target.value)} />
      {actionError ? (
        <p className={s.s} role="alert" style={{ marginTop: 8, color: 'var(--fd-red)' }}>
          {actionError}
        </p>
      ) : null}
      <div className={s.dock}>
        <button type="button" className={cx(s.btn, s.primary, s.block100)} disabled={reply.trim().length < 2 || sending} onClick={() => void sendReply()}>
          {sending ? 'Sending…' : 'Reply'}
        </button>
        <div className={cx(s.meta, s.dockCap)}>Only real questions reach you</div>
      </div>
    </section>
  ) : answered ? (
    <>
      <section className={s.esc} style={{ borderColor: 'var(--fd-hair)' }} aria-label={`${artist} asked`}>
        <div className={s.meta}>{artist} asked</div>
        {answered.question.items.map((item) => (
          <p key={item.at + item.text} className={s.escQ} style={{ color: 'var(--fd-dim)', fontSize: 17 }}>
            {item.text}
          </p>
        ))}
        <div className={s.msgout}>{answered.answer}</div>
      </section>
      {decision === null && rule ? (
        <section className={s.card} aria-labelledby="fd-learn">
          <UrgAnsLabel />
          <h2 className={cx(s.display, s.learnTitle)} id="fd-learn">
            Add this to your terms?
          </h2>
          <label htmlFor="fd-rule" className={s.srOnly}>
            Rule
          </label>
          <textarea id="fd-rule" className={s.quote} value={rule} maxLength={160} onChange={(event) => setRule(event.target.value)} />
          <p className={s.s} style={{ marginTop: 8 }}>
            Your words. Edit them first if you like.
          </p>
          {actionError ? (
            <p className={s.s} role="alert" style={{ marginTop: 8, color: 'var(--fd-red)' }}>
              {actionError}
            </p>
          ) : null}
          <div className={s.btnRow}>
            <button type="button" className={cx(s.btn, s.quiet)} disabled={sending} onClick={() => void decide('once')}>
              Just this once
            </button>
            <button type="button" className={cx(s.btn, s.primary)} disabled={sending || !rule.trim()} onClick={() => void decide('added')}>
              Add to my terms
            </button>
          </div>
        </section>
      ) : null}
      {decision === 'added' ? (
        <Banner tone="ok" title="Added to your terms.">
          AI answers this from now on.{' '}
          <Link href="/curator/front-desk" className={s.linkBtn} style={{ minHeight: 0 }}>
            See terms
          </Link>
        </Banner>
      ) : null}
      {decision === 'once' ? <Banner tone="ok" title="Sent.">Kept to this pitch only.</Banner> : null}
    </>
  ) : (
    <div className={s.rows} style={{ marginTop: 24 }}>
      <div className={s.row}>
        <div className={cx(s.grow, s.s)}>No open questions. Nothing needs you here.</div>
      </div>
    </div>
  );

  return (
    <CuratorFrame name={name}>
      <div className={s.wrap}>
        <div className={cx(s.layout, s.layoutCurator)}>
          <main>
            <Link href="/curator/front-desk/inbox" className={s.crumb}>
              ‹ Pitches
            </Link>
            <div className={s.head}>
              <span className={s.art} aria-hidden="true" />
              <div style={{ minWidth: 0 }}>
                <div className={s.meta}>
                  {detail.pitch.artistName}
                  {detail.pitch.service ? ` · ${detail.pitch.service}` : ''}
                </div>
                <h1 className={cx(s.display, s.headTitle)}>{detail.pitch.songTitle}</h1>
              </div>
            </div>
            {agreedLine ? (
              <div className={s.sumline}>
                <span className={cx(s.pill, s.pillOn)}>
                  <span className={s.dot} aria-hidden="true" />
                  Accepted
                </span>
                <span className={s.s}>{agreedLine}</span>
              </div>
            ) : null}
            {answeredRow}
            {wide ? null : action}
          </main>
          {wide ? <aside className={s.side}>{action}</aside> : null}
        </div>
      </div>
    </CuratorFrame>
  );
}

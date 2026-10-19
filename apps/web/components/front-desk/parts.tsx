'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { DeskAnswer, DeskSource } from '@/lib/front-desk/types';
import type { DeskAccess } from '@/lib/front-desk/client';
import s from './desk.module.css';

export { s as deskStyles };

export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

export function Glyph({ small = false }: { small?: boolean }) {
  return <span className={cx(s.glyph, small && s.glyphSm)} aria-hidden="true" />;
}

export function UrgAnsLabel({ right }: { right?: ReactNode }) {
  return (
    <div className={s.blockHead} style={{ padding: 0, marginBottom: 0 }}>
      <span className={cx(s.meta, s.urgansLabel)}>
        <Glyph small />
        UrgAns
      </span>
      {right}
    </div>
  );
}

/** The citation. Always rendered under an answer; the colour names the kind. */
export function SourceChip({ source }: { source: DeskSource }) {
  const tone = source.kind === 'thread' ? s.srcThread : source.kind === 'status' ? s.srcStatus : '';
  return (
    <span className={cx(s.src, tone)}>
      <span className={s.srOnly}>Source: </span>
      {source.label}
    </span>
  );
}

export function QuestionBubble({ children }: { children: ReactNode }) {
  return <div className={s.q}>{children}</div>;
}

/** One answer: bold lead, the rest, and its source. Plain text only, never HTML. */
export function AnswerBubble({ answer }: { answer: Extract<DeskAnswer, { kind: 'answer' }> }) {
  return (
    <div className={s.a}>
      <Glyph />
      <div className={s.aBody}>
        <div className={s.aTxt}>
          <b>{answer.lead}</b>
          {answer.rest ? ` ${answer.rest}` : ''}
        </div>
        <SourceChip source={answer.source} />
      </div>
    </div>
  );
}

export function UnsureBubble({ lead, rest }: { lead: string; rest?: string }) {
  return (
    <div className={s.a}>
      <Glyph />
      <div className={s.aBody}>
        <div className={s.aTxt}>
          <b>{lead}</b>
          {rest ? ` ${rest}` : ''}
        </div>
      </div>
    </div>
  );
}

export function TypingBubble({ label }: { label: string }) {
  return (
    <div className={s.a} role="status" aria-live="polite">
      <Glyph />
      <div className={s.aBody}>
        <div className={s.typing} aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className={s.meta} style={{ marginTop: 4 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export function Toggle({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={cx(s.toggle, on && s.toggleOn)}
      onClick={() => onChange(!on)}
    />
  );
}

export function Banner({ tone, title, children }: { tone: 'ok' | 'error'; title: string; children?: ReactNode }) {
  return (
    <div className={cx(s.banner, tone === 'error' && s.bannerErr)} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'error' ? (
        <span className={s.bannerIcon} aria-hidden="true">
          !
        </span>
      ) : (
        <span className={s.tick} aria-hidden="true">
          ✓
        </span>
      )}
      <div className={s.grow}>
        <b style={{ fontWeight: 600 }}>{title}</b> {children ? <span className={s.dim}>{children}</span> : null}
      </div>
    </div>
  );
}

/** The standalone top bar: mark · Urganize / <context> · right slot. */
export function DeskBar({ context, right }: { context: string; right?: ReactNode }) {
  return (
    <header className={s.bar}>
      <span className={s.brand}>
        <span className={s.mark} aria-hidden="true" />
        <b>Urganize</b>
        <span className={s.sep} aria-hidden="true">
          /
        </span>
        <span className={s.brandName}>{context}</span>
      </span>
      {right}
    </header>
  );
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';

export function DeskSkeleton() {
  return (
    <div className={s.wrap} aria-busy="true" aria-label="Loading">
      <div className={s.skel} style={{ width: 90, height: 14 }} />
      <div className={s.skel} style={{ width: '70%', height: 40, marginTop: 14 }} />
      <div className={s.skel} style={{ width: '55%', height: 16, marginTop: 14 }} />
      <div className={s.skel} style={{ width: '100%', height: 76, marginTop: 28, borderRadius: 16 }} />
      <div className={s.skel} style={{ width: '100%', height: 168, marginTop: 32, borderRadius: 16 }} />
    </div>
  );
}

/**
 * Every front desk page starts here: loading → skeleton, signed out → sign in,
 * flag off → a calm "not available" (old behaviour for everyone not flagged).
 */
export function DeskGate({ access, children, standalone = true }: { access: DeskAccess; children: ReactNode; standalone?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (access.state === 'signed_out') router.replace(`/auth?next=${encodeURIComponent(pathname || '/front-desk')}`);
  }, [access.state, pathname, router]);

  if (access.state === 'on') return <>{children}</>;
  const body =
    access.state === 'off' ? (
      <div className={s.wrap} style={{ paddingTop: 80, textAlign: 'center' }}>
        <h1 className={cx(s.display, s.title)}>Not here yet</h1>
        <p className={s.sub} style={{ margin: '12px auto 0' }}>
          This part of Urganize isn&rsquo;t on for your account.
        </p>
        <Link href="/dashboard" className={cx(s.btn, s.quiet)} style={{ marginTop: 28 }}>
          Go home
        </Link>
      </div>
    ) : (
      <DeskSkeleton />
    );
  if (!standalone) return <div className={s.desk}>{body}</div>;
  return (
    <div className={cx(s.desk, s.ambient)}>
      <DeskBar context="UrgAns" />
      {body}
    </div>
  );
}

/** True at the desktop breakpoint (900px), so a block renders ONCE in the right column. */
export function useWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

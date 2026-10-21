'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Captions, Check, Mic, MicOff, PhoneOff, X } from '@/components/icons';
import { Button } from '@urganize/ui';
import {
  VOICE_CREDITS_PER_MINUTE,
  VOICE_MAX_CALL_MINUTES,
  VOICE_STATE_LABEL,
  formatMeter,
  isLiveState,
} from '@/lib/urgans-voice-realtime';
import type { ChappiClientAction } from '@/lib/chappi/types';
import { VoiceOrb } from './VoiceOrb';
import { VoiceConfirmCard } from './VoiceConfirmCard';
import { useRealtimeVoice, type VoiceReleaseScope } from './useRealtimeVoice';

const PRIMER_KEY = 'urganize.voice.primer-seen';

/**
 * Talk to UrgAns. A mode of the UrgAns thread, not a separate app: every line
 * said and every action taken lands in the same conversation behind the sheet.
 *
 * Desktop: a panel docked over the lower half of the screen. Mobile: full
 * screen. Controls sit at the bottom, in thumb reach: Mute, End (red),
 * Captions. Space mutes, Esc ends. The meter sits top right and turns amber a
 * minute before the call has to end.
 */
export function VoiceSheet({
  open,
  onClose,
  releaseScope,
  firstName,
  onClientActions,
}: {
  open: boolean;
  onClose: () => void;
  releaseScope: VoiceReleaseScope;
  firstName?: string | null;
  onClientActions?: (actions: ChappiClientAction[]) => void;
}) {
  const call = useRealtimeVoice({ releaseScope, firstName, onClientActions });
  const [showTranscript, setShowTranscript] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const startedRef = useRef(false);
  const live = isLiveState(call.state);

  useEffect(() => setMounted(true), []);

  // Skip the primer after the first call.
  useEffect(() => {
    if (!open || startedRef.current) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(PRIMER_KEY) === '1';
    } catch {
      // Private mode: show the primer every time, which is harmless.
    }
    if (seen) {
      startedRef.current = true;
      void call.start();
    }
  }, [open, call]);

  // Keyboard: Space mutes (unless a control has focus), Esc ends or closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.isContentEditable);
      if (event.key === 'Escape') {
        event.preventDefault();
        if (live) void call.end('user');
        else onClose();
      } else if (event.key === ' ' && live && !typing) {
        event.preventDefault();
        call.toggleMute();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, live, call, onClose]);

  if (!open || !mounted) return null;

  const begin = () => {
    try {
      window.localStorage.setItem(PRIMER_KEY, '1');
    } catch {
      // Ignore.
    }
    startedRef.current = true;
    void call.start();
  };

  const close = () => {
    if (live) void call.end('user');
    startedRef.current = false;
    onClose();
  };

  const withBusy = (action: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const meter = formatMeter({ elapsedMs: call.elapsedMs, balance: call.balance });

  const body = (() => {
    switch (call.state) {
      case 'primer':
        return (
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <h2 className="font-display text-xl font-semibold text-content-primary">Talk to UrgAns</h2>
            <p className="text-sm leading-6 text-content-secondary">
              Say what you need, out loud: make a rollout plan, add an activity, move a date. UrgAns answers, and does it. It asks before anything
              that can&apos;t be undone.
            </p>
            <p className="text-sm font-medium text-content-primary">
              {VOICE_CREDITS_PER_MINUTE} credits a minute, plus whatever UrgAns does for you. Up to {VOICE_MAX_CALL_MINUTES} minutes a call.
            </p>
            <p className="text-xs text-content-tertiary">Your browser will ask to use the microphone. Everything said is saved in this chat.</p>
            <Button type="button" variant="primary" onClick={begin} className="h-12 px-8">
              Start talking
            </Button>
          </div>
        );
      case 'mic_denied':
        return (
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <MicOff className="h-8 w-8 text-status-error" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-content-primary">UrgAns can&apos;t hear you</h2>
            <p className="text-sm leading-6 text-content-secondary">The microphone is blocked for this site. To turn it on:</p>
            <ul className="space-y-1 text-left text-sm text-content-secondary">
              <li>Chrome or Edge: the icon left of the address, then Microphone, then Allow.</li>
              <li>Safari: Safari menu, Settings for this website, Microphone, Allow.</li>
              <li>Firefox: the microphone icon in the address bar, then remove the block.</li>
              <li>On a phone: your phone&apos;s Settings, the browser, Microphone.</li>
            </ul>
            <div className="mt-2 flex gap-3">
              <Button type="button" variant="secondary" onClick={close}>
                Type instead
              </Button>
              <Button type="button" variant="primary" onClick={begin}>
                Try again
              </Button>
            </div>
          </div>
        );
      case 'out_of_credits':
        return (
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <h2 className="font-display text-lg font-semibold text-content-primary">You&apos;re out of credits</h2>
            <p className="text-sm leading-6 text-content-secondary">
              {call.notice ?? `A call needs at least ${VOICE_CREDITS_PER_MINUTE} credits.`} Your conversation is saved.
            </p>
            {call.summary ? <SummaryLine summary={call.summary} /> : null}
            <div className="mt-2 flex gap-3">
              <Button type="button" variant="secondary" onClick={close}>
                Type instead
              </Button>
              <Link href="/dashboard/credits" className="inline-flex h-10 items-center rounded-full bg-brand px-5 text-sm font-medium text-content-inverse">
                Buy credits
              </Link>
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <h2 className="font-display text-lg font-semibold text-content-primary">{VOICE_STATE_LABEL.error}</h2>
            <p className="text-sm leading-6 text-content-secondary">{call.notice ?? 'Voice is not working right now.'}</p>
            <div className="mt-2 flex gap-3">
              <Button type="button" variant="secondary" onClick={close}>
                Type instead
              </Button>
              <Button type="button" variant="primary" onClick={begin}>
                Try again
              </Button>
            </div>
          </div>
        );
      case 'ended':
        return (
          <div className="flex max-w-md flex-col items-center gap-3 text-center">
            <Check className="h-8 w-8 text-status-success" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-content-primary">Call ended</h2>
            {call.notice ? <p className="text-sm text-content-secondary">{call.notice}</p> : null}
            {call.summary ? <SummaryLine summary={call.summary} /> : <p className="text-sm text-content-tertiary">Adding it up…</p>}
            <p className="text-xs text-content-tertiary">The conversation is in this chat.</p>
            <div className="mt-2 flex gap-3">
              <Button type="button" variant="secondary" onClick={close}>
                Done
              </Button>
              <Button type="button" variant="primary" onClick={begin}>
                Talk again
              </Button>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex w-full flex-col items-center gap-4">
            <VoiceOrb state={call.state} level={call.muted ? 0 : call.level} />
            <p role="status" aria-live="polite" className="text-sm font-medium text-content-secondary">
              {call.muted ? 'Muted' : call.state === 'acting' ? 'On it, UrgAns is working…' : VOICE_STATE_LABEL[call.state]}
            </p>
            {call.pending ? (
              <VoiceConfirmCard
                title={call.pending.title}
                detail={call.pending.detail}
                busy={busy}
                onConfirm={withBusy(call.confirm)}
                onCancel={withBusy(call.cancel)}
              />
            ) : null}
            {captionsOn ? (
              showTranscript ? (
                <div className="max-h-48 w-full max-w-lg overflow-y-auto text-sm leading-6" aria-label="Call transcript">
                  {call.transcript.map((line, index) => (
                    <p key={index} className={line.role === 'user' ? 'text-brand' : 'text-content-primary'}>
                      {line.text}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="min-h-[3.5rem] w-full max-w-lg text-center text-base leading-7" aria-live="polite">
                  {call.captions.map((line, index) => (
                    <p key={index} className={line.role === 'user' ? 'text-brand' : 'text-content-primary'}>
                      {line.text}
                    </p>
                  ))}
                </div>
              )
            ) : null}
            {call.actions > 0 ? (
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                className="rounded-full bg-bg-elevated px-3 py-1 text-xs font-medium text-content-secondary"
              >
                {call.actions === 1 ? '1 action done' : `${call.actions} actions done`}
              </button>
            ) : null}
          </div>
        );
    }
  })();

  const sheet = (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/30 sm:items-end" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Talk to UrgAns"
        className="flex h-full w-full flex-col bg-bg-surface shadow-2xl sm:h-[55vh] sm:max-w-3xl sm:rounded-t-2xl sm:border sm:border-stroke-subtle"
      >
        <div className="flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
          <p className="text-sm font-semibold text-content-primary">UrgAns</p>
          <div className="flex items-center gap-2">
            {live || call.state === 'connecting' ? (
              <p
                className={`rounded-full px-3 py-1 text-xs font-medium tabular-nums ${
                  call.warn ? 'bg-status-warning/15 text-status-warning' : 'bg-bg-elevated text-content-secondary'
                }`}
                aria-label={`Call meter: ${meter}`}
              >
                {meter}
              </p>
            ) : null}
            {!live ? (
              <button type="button" onClick={close} aria-label="Close" className="hit-44 relative grid h-9 w-9 place-items-center rounded-full text-content-secondary hover:bg-bg-elevated">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4">
          {call.state === 'connecting' ? (
            <div className="flex flex-col items-center gap-4">
              <VoiceOrb state="connecting" level={0} />
              <p role="status" className="text-sm text-content-secondary">
                {VOICE_STATE_LABEL.connecting}
              </p>
            </div>
          ) : (
            body
          )}
        </div>

        {live ? (
          <div className="flex items-center justify-center gap-6 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <button
              type="button"
              onClick={call.toggleMute}
              aria-label={call.muted ? 'Unmute' : 'Mute'}
              aria-pressed={call.muted}
              className="grid h-14 w-14 place-items-center rounded-full bg-bg-elevated text-content-primary"
            >
              {call.muted ? <MicOff className="h-5 w-5" aria-hidden="true" /> : <Mic className="h-5 w-5" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={() => void call.end('user')}
              aria-label="End call"
              className="grid h-16 w-16 place-items-center rounded-full bg-status-error text-white"
            >
              <PhoneOff className="h-6 w-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!captionsOn) setCaptionsOn(true);
                else setShowTranscript((v) => !v);
              }}
              onDoubleClick={() => setCaptionsOn((v) => !v)}
              aria-label={showTranscript ? 'Show captions' : 'Show full transcript'}
              aria-pressed={showTranscript}
              className="grid h-14 w-14 place-items-center rounded-full bg-bg-elevated text-content-primary"
            >
              <Captions className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

function SummaryLine({ summary }: { summary: { minutes: number; credits: number; actions: number } }) {
  const minutes = summary.minutes === 1 ? '1 minute' : `${summary.minutes} minutes`;
  const credits = summary.credits === 1 ? '1 credit' : `${summary.credits} credits`;
  const actions = summary.actions === 0 ? 'no actions' : summary.actions === 1 ? '1 action' : `${summary.actions} actions`;
  return (
    <p className="text-sm font-medium text-content-primary">
      {minutes} · {credits} for the call · {actions}
    </p>
  );
}

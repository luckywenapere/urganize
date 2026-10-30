'use client';

import { useState } from 'react';
import { Check, Loader2 } from '@/components/icons';
import { BRIEF_GUESTS_MAX, briefGuestShareText, whatsappShareUrl } from '@/lib/brief-guests';
import { formatBriefDay, type BriefPayload } from '@/lib/release-brief';
import type { BriefGuest } from '@/lib/release-brief-guests-server';
import { briefCall } from './brief-shared';

/**
 * Share with a person (#897 phase 6; mock docs/mocks/brief-share-person). In
 * the Share sheet, under the view link: a name, an optional email and their
 * part from What we're making. Makes a guest invite limited to this rollout;
 * no paid seat, 5 per rollout (Oyin, 31 Oct 2026). Owner and team admins only.
 */

type Toast = (message: string, tone: 'success' | 'error' | 'warning') => void;

const FIELD =
  'w-full rounded-lg border border-stroke-control bg-bg-base px-3 py-2 text-[16px] text-content-primary placeholder:text-content-tertiary focus:border-brand focus:outline-none lg:text-sm';
const BUTTON =
  'motion-focus motion-press flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold transition-colors disabled:opacity-60';

export function BriefGuestShare({
  brief,
  senderName,
  onChanged,
  onToast,
}: {
  brief: BriefPayload;
  senderName: string;
  onChanged: () => void;
  onToast: Toast;
}) {
  const guests = brief.board.guests ?? [];
  const pieces = (brief.board.pieces?.items ?? []).filter((piece) => piece.state !== 'done');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState<{ guest: BriefGuest; emailSent: boolean } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const full = guests.length >= BRIEF_GUESTS_MAX;

  const share = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    const result = await briefCall<{ guest: BriefGuest; emailSent: boolean }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/guests`,
      { method: 'POST', body: JSON.stringify({ name, email: email || undefined, taskIds: picked }) }
    );
    setSaving(false);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    setReady(result.data);
    setName('');
    setEmail('');
    setPicked([]);
    onChanged();
  };

  const remove = async (guest: BriefGuest) => {
    setRemoving(guest.id);
    const result = await briefCall<{ id: string }>(
      `/api/releases/${encodeURIComponent(brief.releaseId)}/brief/guests/${encodeURIComponent(guest.id)}`,
      { method: 'DELETE' }
    );
    setRemoving(null);
    if (!result.ok) {
      onToast(result.error, 'error');
      return;
    }
    onChanged();
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      onToast('Link copied.', 'success');
    } catch {
      onToast(link, 'warning');
    }
  };

  if (ready && ready.guest.link) {
    const link = ready.guest.link;
    const text = briefGuestShareText({ senderName, releaseTitle: brief.board.title, link });
    return (
      <div className="mt-[18px] border-t border-stroke-subtle pt-4">
        <p className="font-display text-[18px] text-content-primary">{ready.guest.name}&rsquo;s link is ready</p>
        <p className="mt-0.5 text-[13px] text-content-secondary">
          It opens the brief and their part. It works for 30 days.
          {ready.emailSent ? ` We also emailed it to ${ready.guest.email}.` : ''}
        </p>
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-3">
          <a
            href={whatsappShareUrl(text)}
            target="_blank"
            rel="noreferrer noopener"
            className={`${BUTTON} bg-[#1f8f4e] text-white hover:opacity-90`}
          >
            Send on WhatsApp
          </a>
          <button type="button" onClick={() => void copy(link)} className={`${BUTTON} mt-2 border border-stroke-control bg-bg-surface text-content-primary hover:bg-bg-hover`}>
            Copy the link
          </button>
        </div>
        <button type="button" onClick={() => setReady(null)} className={`${BUTTON} mt-2 text-content-secondary hover:text-content-primary`}>
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="mt-[18px] border-t border-stroke-subtle pt-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-content-tertiary">Share with a person</p>
      {full ? (
        <p className="mt-2 text-[13.5px] text-content-secondary">
          This rollout has {BRIEF_GUESTS_MAX} guests, the most it can have. Remove one to add another.
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Their name" aria-label="Their name" className={FIELD} />
            <input type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (optional)" aria-label="Email" className={FIELD} />
          </div>
          {pieces.length ? (
            <>
              <p className="mt-3.5 text-[11px] font-bold uppercase tracking-[0.09em] text-content-tertiary">Their part</p>
              <ul className="mt-1">
                {pieces.map((piece) => {
                  const on = picked.includes(piece.id);
                  return (
                    <li key={piece.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => setPicked((list) => (on ? list.filter((id) => id !== piece.id) : [...list, piece.id]))}
                        className="motion-focus flex min-h-11 w-full items-center gap-3 border-b border-stroke-subtle text-left text-[14px] text-content-primary last:border-b-0"
                      >
                        <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] ${on ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-strong'}`}>
                          {on ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{piece.title}</span>
                        {piece.assigneeName ? <span className="text-[12px] text-content-tertiary">{piece.assigneeName}</span> : null}
                        {piece.dueDate ? <span className="font-mono text-[12px] text-content-tertiary">{formatBriefDay(piece.dueDate)}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-[12.5px] text-content-tertiary">Add pieces to What we&rsquo;re making to give them a part.</p>
          )}
          <button
            type="button"
            onClick={() => void share()}
            disabled={!name.trim() || saving}
            className={`${BUTTON} mt-3.5 bg-brand text-content-inverse hover:bg-brand-hover`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : `Make ${name.trim() ? `${name.trim().split(' ')[0]}’s` : 'their'} link`}
          </button>
          <p className="mt-2 text-[12.5px] text-content-tertiary">
            Guests are free: up to {BRIEF_GUESTS_MAX} on a rollout. {guests.length} of {BRIEF_GUESTS_MAX} used.
          </p>
        </>
      )}

      {guests.length ? (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-content-tertiary">Guests on this rollout</p>
          <ul className="mt-1">
            {guests.map((guest) => (
              <li key={guest.id} className="flex min-h-11 items-center gap-2 text-[13.5px]">
                <span className="truncate font-medium text-content-primary">{guest.name}</span>
                <span className={`shrink-0 rounded-full border px-2 py-[1px] text-[10.5px] font-semibold ${guest.status === 'active' ? 'border-brand/35 bg-brand/10 text-brand' : 'border-stroke-strong text-content-secondary'}`}>
                  {guest.status === 'active' ? 'Joined' : 'Invited'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-content-tertiary">{guest.part.join(', ')}</span>
                {guest.link ? (
                  <button type="button" onClick={() => void copy(guest.link as string)} className="motion-focus shrink-0 text-[12.5px] font-semibold text-brand">
                    Copy link
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void remove(guest)}
                  disabled={removing === guest.id}
                  className="motion-focus shrink-0 text-[12.5px] text-content-tertiary underline underline-offset-[3px] hover:text-content-primary"
                >
                  {removing === guest.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

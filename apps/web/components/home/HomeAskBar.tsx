'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  COMPOSER_TRANSITION_NAME,
  SOURCE_ATTRIBUTE,
  navigateWithTransition,
} from '@/lib/view-transition';
import { ArrowUp, Loader2, Mic } from '@/components/icons';
import { ChappiAttachMenu } from '@/components/chappi/ChappiAttachMenu';
import { ChappiAttachmentTray } from '@/components/chappi/ChappiAttachments';
import { ChappiScopePicker } from '@/components/chappi/ChappiScopePicker';
import { useAttachments } from '@/components/chappi/useAttachments';
import { useVoiceInput } from '@/components/chappi/useVoiceInput';
import { isUrgansVoiceEnabled } from '@/lib/chappi/config';
import { mergeTranscript } from '@/lib/urgans-voice';
import { useChappiStore } from '@/stores/useChappiStore';
import { useReleaseStore } from '@/stores/useReleaseStore';

const VOICE_ENABLED = isUrgansVoiceEnabled();

/**
 * A real chat box on Home, just above the fold button, with the same controls
 * as the UrgAns chat: attach a photo or file, pick the rollout the message is
 * about, talk instead of typing, send. Search lives in the top bar, so this one
 * only talks to UrgAns: send and the conversation opens (the drawer on a
 * desktop, the full page on a phone) with the message and files already sent.
 * It stands in for the floating UrgAns button, which is hidden on Home.
 */
export function HomeAskBar() {
  const router = useRouter();
  const releases = useReleaseStore((state) => state.releases);
  const scopedReleaseId = useChappiStore((state) => state.scopedReleaseId);
  const setScopedReleaseId = useChappiStore((state) => state.setScopedReleaseId);
  const setInput = useChappiStore((state) => state.setInput);
  const setSendInputOnOpen = useChappiStore((state) => state.setSendInputOnOpen);
  const setPendingAttachments = useChappiStore((state) => state.setPendingAttachments);
  const [text, setText] = useState('');
  const attach = useAttachments();

  const scopedRelease = scopedReleaseId
    ? releases.find((release) => release.id === scopedReleaseId) ?? null
    : null;
  const voice = useVoiceInput({
    enabled: VOICE_ENABLED,
    onTranscript: (spoken) => setText((current) => mergeTranscript(current, spoken)),
    getHints: () =>
      scopedRelease
        ? { releaseTitle: scopedRelease.title, artistName: scopedRelease.artistName }
        : {},
  });
  const isRecording = voice.state === 'recording';
  const isTranscribing = voice.state === 'transcribing';
  const busy = isRecording || isTranscribing;
  const canSend = (text.trim().length > 0 || attach.attachments.length > 0) && attach.pending === 0 && !busy;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    setInput(text.trim());
    setPendingAttachments(attach.attachments);
    setSendInputOnOpen(true);
    setText('');
    attach.clear();
    // Always the full chat page, never a drawer: the page mounts the
    // conversation that picks the message up and sends it.
    navigateWithTransition(() => router.push('/dashboard/urgans'), '/dashboard/urgans');
  };

  // Enter sends, Shift+Enter makes a new line, like every chat box.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <>
    {/* A phone has no room to type on Home with the keyboard up, so the box is
        a tap target: the full chat opens with the keyboard ready. */}
    <button
      type="button"
      onClick={() =>
        navigateWithTransition(() => router.push('/dashboard/urgans'), '/dashboard/urgans')
      }
      style={{ viewTransitionName: COMPOSER_TRANSITION_NAME }}
      {...{ [SOURCE_ATTRIBUTE]: '' }}
      className="motion-focus flex h-14 w-full items-center rounded-2xl border border-stroke-control bg-bg-surface px-4 text-left text-base text-content-tertiary lg:hidden"
    >
      Message UrgAns...
    </button>
    <form
      onSubmit={handleSubmit}
      style={{ viewTransitionName: COMPOSER_TRANSITION_NAME }}
      {...{ [SOURCE_ATTRIBUTE]: '' }}
      className="hidden rounded-2xl border border-stroke-control bg-bg-surface p-3 focus-within:border-content-secondary lg:block"
    >
      <ChappiAttachmentTray
        attachments={attach.attachments}
        pending={attach.pending}
        onRemove={attach.remove}
      />
      {isRecording ? (
        <div role="status" className="flex min-h-[3.25rem] items-center gap-2 px-1 text-base text-content-secondary">
          <span className="h-2 w-2 shrink-0 rounded-full bg-status-error motion-safe:animate-pulse" aria-hidden="true" />
          Listening...
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={(event) => {
            const pictures = Array.from(event.clipboardData?.files ?? []).filter((file) =>
              file.type.startsWith('image/')
            );
            if (pictures.length === 0) return;
            event.preventDefault();
            void attach.addFiles(pictures);
          }}
          rows={2}
          placeholder={isTranscribing ? 'Turning your voice into text...' : 'Message UrgAns...'}
          aria-label="Message UrgAns"
          enterKeyHint="send"
          disabled={isTranscribing}
          className="block max-h-40 min-h-[3.25rem] w-full resize-none bg-transparent px-1 text-base text-content-primary placeholder:text-content-tertiary focus:outline-none disabled:opacity-60"
        />
      )}
      <div className="mt-2 flex items-center gap-1">
        <ChappiAttachMenu disabled={busy} onFiles={(files) => void attach.addFiles(files)} />
        <ChappiScopePicker
          releases={releases}
          scopedReleaseId={scopedReleaseId}
          onSelect={setScopedReleaseId}
        />
        <span className="flex-1" />
        {voice.supported ? (
          <button
            type="button"
            onClick={voice.toggle}
            data-recording={isRecording ? 'true' : undefined}
            aria-label={isRecording ? 'Stop recording' : 'Talk to UrgAns'}
            disabled={isTranscribing || voice.state === 'requesting'}
            className="motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full text-content-secondary transition-colors hover:bg-bg-elevated hover:text-content-primary disabled:opacity-40 data-[recording=true]:text-status-error"
          >
            {isTranscribing || voice.state === 'requesting' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : isRecording ? (
              <span className="h-3 w-3 rounded-[3px] bg-current" aria-hidden="true" />
            ) : (
              <Mic className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
        <button
          type="submit"
          aria-label="Send to UrgAns"
          disabled={!canSend}
          className="motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-content-inverse transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      {voice.error ? (
        <p role="status" className="mt-2 px-1 text-xs text-content-tertiary">
          {voice.error}
        </p>
      ) : null}
      {attach.error ? (
        <p role="alert" className="mt-2 px-1 text-xs text-status-error">
          {attach.error}
        </p>
      ) : null}
    </form>
    </>
  );
}

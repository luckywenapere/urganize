'use client';

import { useState, type FormEvent } from 'react';
import { Logo } from '@urganize/ui/Logo';
import { Plus } from '@/components/icons';
import { SetupSteps } from '@/components/onboarding/SetupSteps';
import { useShellStore } from '@/stores/useShellStore';

// The first artist, on a computer (#1229, part of #1175; mock
// docs/mocks/signin-onboarding-desktop, screen 4). An empty Home used to show
// "No artists yet." beside a looping demo that read like a page failing to
// load. Now the first visit is step 3 of 3: one field that takes a name or a
// pasted Spotify link, Add artist, and what comes after in three cards.
//
// The field hands what was typed to the Add artist dialog (openAddArtist), so
// the search, the paste-their-link lookup (#1129) and the duplicate check are
// the ones that already exist, not a second copy. "Do this later" puts the
// person on Home; it is remembered per person in this browser.

const LATER_KEY_PREFIX = 'urganize.first-artist.later.';

export function readFirstArtistLater(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return window.localStorage.getItem(`${LATER_KEY_PREFIX}${userId}`) === '1';
  } catch {
    return false;
  }
}

function writeFirstArtistLater(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(`${LATER_KEY_PREFIX}${userId}`, '1');
  } catch {
    // Only a convenience: Home still opens for this visit.
  }
}

const NEXT_STEPS = [
  { when: 'Next', title: 'Plan a rollout', line: 'Pick a record and the AI builds the plan.' },
  { when: 'Then', title: 'Bring your team in', line: 'Invite people and choose what they see.' },
  { when: 'Any time', title: 'Ask the AI', line: 'It knows your artists and what is due.' },
] as const;

export function FirstArtistDesk({ userId, onLater }: { userId: string | null; onLater: () => void }) {
  const openAddArtist = useShellStore((state) => state.openAddArtist);
  const [value, setValue] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    openAddArtist({ query: value.trim() });
  };

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg-base text-content-primary">
      <header className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-6 px-10 pt-2">
        <Logo size="sm" className="opacity-95" />
        <SetupSteps current={3} />
        <button
          type="button"
          onClick={() => {
            writeFirstArtistLater(userId);
            onLater();
          }}
          className="justify-self-end text-[13px] font-semibold text-content-secondary underline-offset-[3px] hover:text-content-primary hover:underline"
        >
          Do this later
        </button>
      </header>
      <main className="mx-auto max-w-[640px] px-8 pb-[72px] pt-14 text-center">
        <h1 className="font-display text-[36px] font-normal leading-[44px] text-content-primary">
          Who are you working with?
        </h1>
        <p className="mt-2 text-[15px] text-content-secondary">
          Add your first artist. Their records and rollouts live on their page.
        </p>
        <form onSubmit={submit} className="mt-7 flex gap-2.5 text-left">
          <label htmlFor="first-artist" className="sr-only">
            Artist name, or paste their Spotify link
          </label>
          <input
            id="first-artist"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Artist name, or paste their Spotify link"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            className="h-[46px] min-w-0 flex-1 rounded-xl border border-content-tertiary bg-bg-surface px-3.5 text-[14px] text-content-primary outline-none placeholder:text-content-tertiary focus:border-brand"
          />
          <button
            type="submit"
            className="inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-full bg-content-primary px-[22px] text-[14px] font-semibold text-bg-base transition-colors hover:bg-content-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add artist
          </button>
        </form>
        <ul className="mt-12 grid grid-cols-3 gap-3 text-left">
          {NEXT_STEPS.map((step) => (
            <li key={step.title} className="rounded-[14px] border border-stroke-default bg-bg-surface p-4">
              <p className="text-xs font-semibold text-content-tertiary">{step.when}</p>
              <p className="mt-1.5 font-semibold text-content-primary">{step.title}</p>
              <p className="mt-0.5 text-[13px] text-content-secondary">{step.line}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

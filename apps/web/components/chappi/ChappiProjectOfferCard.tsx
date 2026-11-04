'use client';

import { useState } from 'react';
import {
  projectOfferChoices,
  projectOfferQuestion,
  type ProjectOffer,
  type ProjectOfferChoice,
} from '@/lib/project-offer';

/**
 * The next jobs on a project, offered under the reply after something was
 * filed on it (2026-11-04, #1074, mock screen 6). The jobs come from the
 * project's suggestion list, never from the model; a tap adds them. One tap,
 * then the card goes, so a job is never added twice.
 */
export function ChappiProjectOfferCard({
  offer,
  onChoose,
}: {
  offer: ProjectOffer;
  onChoose: (choice: ProjectOfferChoice) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const choices = projectOfferChoices(offer);

  return (
    <div className="space-y-2.5">
      <p className="text-[15px] leading-relaxed text-content-primary">{projectOfferQuestion(offer)}</p>
      <div className="flex flex-wrap justify-end gap-2" role="group" aria-label={`Add jobs to ${offer.recordTitle}`}>
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onChoose(choice);
              } finally {
                setBusy(false);
              }
            }}
            className={`motion-focus motion-press inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold disabled:opacity-50 ${
              choice.key === 'all'
                ? 'border-brand bg-brand/10 text-content-primary'
                : 'border-stroke-default text-content-primary hover:border-stroke-strong'
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

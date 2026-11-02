/**
 * The small pictures beside entries in the What's new panel (#977, mock
 * approved Nov 1, 2026). A changelog entry names one with `still`; entries
 * without one show text only.
 *
 * Drawn as markup in the app's own colours, so they follow light and dark and
 * cost no image bytes. Each shows its one change and nothing else, with the
 * same words the real screen uses. Names are made up. The photo is a flat
 * drawing of a picture, not a placeholder (placeholders are ProfileFace's
 * initials tiles).
 */

import type { ReleaseStill } from '@urganize/changelog';
import { Check, Smartphone } from '@/components/icons';

// The tinted well every still sits in. On a phone it spans the panel; from
// `sm` up it is a fixed column beside the notes.
const WELL =
  'relative flex h-[118px] items-start justify-center overflow-hidden rounded-[16px] bg-bg-hover px-3 pt-3 sm:h-[122px] sm:w-[13rem] sm:shrink-0';
// A card that runs off the well's foot, as if the screen carries on below.
const CARD_OFF_FOOT = 'rounded-t-[12px] border border-b-0 bg-bg-surface';

function Radio({ on }: { on: boolean }) {
  return on ? (
    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand">
      <span className="h-1.5 w-1.5 rounded-full bg-bg-surface" />
    </span>
  ) : (
    <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-content-tertiary/60" />
  );
}

function PayYourWay() {
  const rows = [
    {
      label: 'Naira card',
      mark: <span className="block h-[11px] w-4 rounded-[3px] border-[1.5px] border-content-secondary" />,
    },
    { label: 'Mobile money', mark: <Smartphone className="h-4 w-4 text-content-secondary" />, on: true },
    {
      label: 'USDT',
      mark: <span className="grid h-4 w-4 place-items-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">₮</span>,
    },
  ];
  return (
    <div className="w-full max-w-[15rem] rounded-[12px] border border-stroke-default bg-bg-surface p-1">
      {rows.map((row) => (
        <div
          key={row.label}
          className={`flex h-[29px] items-center gap-2 rounded-[8px] px-2 ${row.on ? 'bg-brand/10' : ''}`}
        >
          <span className="grid w-4 shrink-0 place-items-center">{row.mark}</span>
          <span className="flex-1 truncate text-[12.5px] text-content-primary">{row.label}</span>
          <Radio on={Boolean(row.on)} />
        </div>
      ))}
    </div>
  );
}

function Plans() {
  const plans = [
    { name: 'Emerging', price: '₦4,000' },
    { name: 'Pro', price: '₦40,000', on: true },
  ];
  return (
    <div className="flex w-full max-w-[15rem] gap-1.5 self-stretch">
      {plans.map((plan) => (
        <div
          key={plan.name}
          className={`flex-1 px-2.5 pt-2.5 ${CARD_OFF_FOOT} ${plan.on ? 'border-[1.5px] border-brand' : 'border-stroke-default'}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-content-primary">{plan.name}</span>
            {plan.on ? (
              <span className="grid h-4 w-4 place-items-center rounded-full bg-brand text-bg-surface">
                <Check className="h-2.5 w-2.5" />
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 font-mono text-[13px] text-content-primary">{plan.price}</p>
          <p className="mt-1 text-[10.5px] text-content-tertiary">a month</p>
        </div>
      ))}
    </div>
  );
}

// A flat drawing of a photo (hills over water), fixed colours in both themes
// because a photo does not change with the theme.
function PhotoDrawing() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 rounded-full" aria-hidden="true">
      <rect width="40" height="40" fill="#b9cfd8" />
      <circle cx="29" cy="11" r="4" fill="#f3e6c4" />
      <path d="M0 26 L10 15 L17 21 L25 12 L40 25 L40 40 L0 40 Z" fill="#4f6b5a" />
      <path d="M0 27 L40 26 L40 40 L0 40 Z" fill="#6f8f9c" />
      <path d="M6 31 H18 M22 34 H34" stroke="#a9c1ca" strokeWidth="1.2" />
    </svg>
  );
}

function Photo() {
  return (
    <div className={`mt-4 flex w-full max-w-[15rem] items-start gap-2.5 self-stretch border-stroke-default px-3 pt-3 ${CARD_OFF_FOOT}`}>
      <PhotoDrawing />
      <div className="min-w-0 pt-1">
        <p className="truncate text-[12.5px] font-semibold text-content-primary">Ada Okoro</p>
        <p className="truncate text-[11px] text-content-tertiary">Northline Music</p>
      </div>
    </div>
  );
}

const DRAWINGS: Record<ReleaseStill, () => React.JSX.Element> = {
  'pay-your-way': PayYourWay,
  plans: Plans,
  photo: Photo,
};

/** The still for one changelog entry, in its tinted well. Decorative: the notes beside it say the same. */
export function WhatsNewStill({ still }: { still: ReleaseStill }) {
  const Drawing = DRAWINGS[still];
  return (
    <div aria-hidden="true" className={WELL}>
      <Drawing />
    </div>
  );
}

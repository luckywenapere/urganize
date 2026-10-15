import type { PublicUnclaimed } from '@/lib/person-unclaimed-server';
import { UNCLAIMED_COPY } from '@/lib/claim-copy';
import { profileInitials } from '@/components/shared/ProfileFace';
import { RemovalForm } from './RemovalForm';
import { ProfileGrowthFooter } from './ProfileGrowthFooter';
import { UnclaimedActions } from './UnclaimedActions';

// The public page for somebody who has not claimed their profile (URG-304):
// a dashed monogram, the name with an "Unclaimed" pill, the role they were
// credited for, Claim this profile, Invite <name>, and a small Request removal.
//
// Public business facts only: the name on a credit and the credited role.
// Nothing the person did not give a team on a credits form, and nothing that
// reads as them endorsing Urganize. Bare-minimum text: no explainer.
//
// Same dark-locked palette as the claimed page (.kit-island).

const GROUND = 'var(--kit-ground)';
const CREAM = 'var(--kit-text)';
const MUTED = 'var(--kit-text-muted)';
const STROKE = 'var(--kit-border)';

export function UnclaimedProfileView({ person }: { person: PublicUnclaimed }) {
  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: GROUND, color: CREAM }}>
      <main className="mx-auto w-full max-w-md pb-16">
        <div aria-hidden className="h-[110px]" style={{ backgroundColor: '#111' }} />
        <header className="-mt-[50px] px-[22px]">
          <div
            aria-hidden
            className="flex h-[104px] w-[104px] items-center justify-center rounded-full text-4xl font-extrabold"
            style={{
              backgroundColor: '#161616',
              border: '2px dashed rgba(255,255,255,.3)',
              outline: `4px solid ${GROUND}`,
              color: 'rgba(255,255,255,.7)',
            }}
          >
            {profileInitials(person.displayName)}
          </div>
          <h1 className="mt-3.5 flex flex-wrap items-center gap-x-2 font-display text-[30px] leading-tight">
            <span>{person.displayName}</span>
            <span
              className="rounded-full px-2 py-0.5 font-sans text-xs font-bold"
              style={{ border: `1px solid ${STROKE}`, color: MUTED }}
            >
              {UNCLAIMED_COPY.badge}
            </span>
          </h1>
          {person.roleLabel ? (
            <p className="mt-1.5 font-mono text-[15px]" style={{ color: MUTED }}>
              {person.roleLabel}
            </p>
          ) : null}
        </header>

        <div className="px-[22px]">
          <UnclaimedActions slug={person.slug} displayName={person.displayName} />
          <RemovalForm slug={person.slug} />
        </div>

        <div className="mt-16 px-[22px]">
          <ProfileGrowthFooter slug={person.slug} />
        </div>
      </main>
    </div>
  );
}

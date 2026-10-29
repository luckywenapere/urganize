'use client';

// The team screens (#854, spec S2 and S3): You're invited (one Join card per
// invite), Set up your team, and Ask your team to invite you. Presentation
// only: the page (app/onboarding/OnboardingPageClient.tsx) owns the calls,
// the checking for invites and where each button goes.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  MAX_TEAM_NAME_LENGTH,
  TEAM_WHO_FOR_OPTIONS,
  askInviteMessage,
  describeTeamBlocker,
  inviteRoleLabel,
  whatsappShareUrl,
  type TeamInvite,
  type TeamWhoFor,
} from '@/lib/onboarding-flow';
import {
  AccountChip,
  BackLink,
  Heading,
  Lede,
  Spinner,
  Split,
  errorTextClass,
  hintClass,
  icons,
  initialsOf,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallSecondaryClass,
  surfaceClass,
  textLinkClass,
} from './OnboardingFrame';

type Account = { name: string; email: string; onLogout: () => void };

function Chips({ account }: { account: Account }) {
  return <AccountChip place="top" name={account.name} email={account.email} onLogout={account.onLogout} />;
}

function BottomChip({ account }: { account: Account }) {
  return <AccountChip place="bottom" name={account.name} email={account.email} onLogout={account.onLogout} />;
}

// ── Checking ─────────────────────────────────────────────────────────────────

export function TeamLoadingScreen({ account }: { account: Account }) {
  return (
    <Split
      left={
        <>
          <Heading>Your team</Heading>
          <Lede>Checking for invites to {account.email}.</Lede>
          <Chips account={account} />
        </>
      }
      right={
        <div className={`${surfaceClass} p-4`} aria-busy="true" aria-live="polite">
          <span className="sr-only">Checking for invites</span>
          <div className="h-3.5 w-[55%] animate-pulse rounded-full bg-bg-hover" />
          <div className="mt-3 h-3.5 w-[85%] animate-pulse rounded-full bg-bg-hover" />
          <div className="mt-[18px] h-11 animate-pulse rounded-full bg-bg-hover" />
        </div>
      }
    />
  );
}

// ── You're invited ───────────────────────────────────────────────────────────

function InviteCard({
  invite,
  busy,
  disabled,
  highlight,
  onJoin,
}: {
  invite: TeamInvite;
  busy: boolean;
  disabled: boolean;
  highlight: boolean;
  onJoin: () => void;
}) {
  return (
    <div className={`${surfaceClass} p-4 ${highlight ? 'animate-fade-in border-brand' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bg-hover text-[13px] font-semibold text-content-secondary">
          {initialsOf(invite.teamName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{invite.teamName}</p>
          <p className="text-[13.5px] text-content-secondary">
            {invite.inviterName} invited you as {inviteRoleLabel(invite.role, invite.artistScoped)}.
          </p>
        </div>
      </div>
      <button type="button" onClick={onJoin} disabled={disabled} className={`${primaryButtonClass} mt-3.5`}>
        {busy ? 'Joining…' : `Join ${invite.teamName}`}
      </button>
    </div>
  );
}

export function InvitesScreen({
  account,
  invites,
  joiningId,
  error,
  arrived,
  arrivedBy,
  onJoin,
  onCreateTeam,
}: {
  account: Account;
  invites: TeamInvite[];
  joiningId: string | null;
  error: string;
  /** The invite landed while they waited on the ask screen. */
  arrived: boolean;
  arrivedBy: string;
  onJoin: (invite: TeamInvite) => void;
  onCreateTeam: () => void;
}) {
  return (
    <Split
      left={
        <>
          <Heading>{arrived ? 'Your invite is here' : "You're invited"}</Heading>
          <Lede>
            {arrived
              ? `${arrivedBy} added you. Join to see the plan and what's yours to do.`
              : "Join the team to see the plan and what's yours to do."}
          </Lede>
          <Chips account={account} />
        </>
      }
      right={
        <>
          <div className="space-y-2.5">
            {invites.map((invite) => (
              <InviteCard
                key={invite.workspaceId}
                invite={invite}
                highlight={arrived}
                busy={joiningId === invite.workspaceId}
                disabled={Boolean(joiningId)}
                onJoin={() => onJoin(invite)}
              />
            ))}
          </div>
          {error ? (
            <p role="alert" className={errorTextClass}>
              {error}
            </p>
          ) : null}
          <p className="mt-5 text-center text-sm text-content-secondary">
            {arrived ? 'Not the right team? ' : 'Want your own team too? '}
            <button type="button" onClick={onCreateTeam} className={textLinkClass}>
              {arrived ? 'Create my own team instead' : 'Create a team'}
            </button>
          </p>
          <BottomChip account={account} />
        </>
      }
    />
  );
}

// ── Set up your team ─────────────────────────────────────────────────────────

export function SetupTeamScreen({
  account,
  defaultName,
  initialName,
  initialWhoFor,
  teamMade,
  checkFailed,
  busy,
  error,
  onSubmit,
  onAsk,
}: {
  account: Account;
  defaultName: string;
  initialName: string;
  initialWhoFor: TeamWhoFor | null;
  /** They came back from New project: "Your team", "Save and continue", no joining card. */
  teamMade: boolean;
  checkFailed: boolean;
  busy: boolean;
  error: string;
  onSubmit: (input: { name: string; whoFor: TeamWhoFor; nameEdited: boolean }) => void;
  onAsk: () => void;
}) {
  const [name, setName] = useState(initialName || defaultName);
  const [whoFor, setWhoFor] = useState<TeamWhoFor | null>(initialWhoFor);
  const nameRef = useRef<HTMLInputElement>(null);
  const blocker = describeTeamBlocker({ name, whoFor });

  // The suggestion is selected, so typing replaces it.
  useEffect(() => {
    if (!teamMade && window.matchMedia?.('(pointer: fine)').matches) nameRef.current?.select();
  }, [teamMade]);

  const submit = () => {
    if (blocker || !whoFor || busy) return;
    onSubmit({ name, whoFor, nameEdited: name.trim() !== defaultName });
  };

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="md:rounded-2xl md:border md:border-stroke-control md:bg-bg-surface md:p-4"
    >
      <label className="block">
        <span className={labelClass}>Team name</span>
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Northline Music"
          maxLength={MAX_TEAM_NAME_LENGTH + 40}
          autoComplete="organization"
          className={inputClass}
        />
        <span className={hintClass}>Your team sees this name, and so does anyone you invite.</span>
      </label>
      <div role="radiogroup" aria-label="Who is this team for?" className="mt-4">
        <span className={labelClass}>Who is this team for?</span>
        <div className="grid gap-2">
          {TEAM_WHO_FOR_OPTIONS.map((option) => {
            const selected = whoFor === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setWhoFor(option.value)}
                className={`motion-press flex min-h-[52px] w-full items-center gap-3 rounded-xl border bg-bg-base px-3.5 py-2.5 text-left transition-colors duration-fast hover:bg-bg-hover ${
                  selected ? 'border-brand shadow-[inset_0_0_0_0.5px_rgb(var(--color-brand))]' : 'border-stroke-control'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] ${
                    selected ? 'border-brand bg-brand' : 'border-stroke-control'
                  }`}
                >
                  {selected ? <span className="h-2 w-2 rounded-full bg-content-inverse" /> : null}
                </span>
                <span className="text-[15px] font-medium text-content-primary">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-5">
        <button type="submit" disabled={Boolean(blocker) || busy} aria-describedby="team-blocker" className={primaryButtonClass}>
          {busy ? (teamMade ? 'Saving…' : 'Making your team…') : teamMade ? 'Save and continue' : 'Create team'}
        </button>
        <p id="team-blocker" className="mt-2 min-h-5 text-center text-[13px] text-content-secondary">
          {blocker}
        </p>
        {error ? (
          <p role="alert" className="text-center text-[13px] text-status-error">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );

  return (
    <Split
      left={
        <>
          <Heading>{teamMade ? 'Your team' : 'Set up your team'}</Heading>
          <Lede>Your team is everyone who works on your releases. You can invite them next.</Lede>
          {checkFailed ? <p className={hintClass}>Couldn&apos;t check for invites. We&apos;ll keep looking.</p> : null}
          <Chips account={account} />
        </>
      }
      right={
        <>
          {form}
          {teamMade ? null : (
            <div className={`${surfaceClass} mt-2.5 overflow-clip`}>
              <button
                type="button"
                onClick={onAsk}
                className="flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-bg-hover"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-bg-hover text-content-secondary">
                  {icons.people}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">I&apos;m joining someone&apos;s team</span>
                  <span className="block truncate text-[13px] text-content-secondary">Ask the owner to invite {account.email}.</span>
                </span>
                {icons.chevron}
              </button>
            </div>
          )}
          <BottomChip account={account} />
        </>
      }
    />
  );
}

// ── Ask your team to invite you ──────────────────────────────────────────────

export function AskInviteScreen({
  account,
  longWait,
  onBack,
  onUseDifferentEmail,
  onAsked,
  onJoinLink,
  linkError,
  linkBusy,
  status,
}: {
  account: Account;
  /** Still waiting after 30 minutes on screen. */
  longWait: boolean;
  onBack: () => void;
  onUseDifferentEmail: () => void;
  onAsked: (channel: 'whatsapp' | 'copy') => void;
  onJoinLink: (link: string) => void;
  linkError: string;
  linkBusy: boolean;
  /** A short line after Copy or Send ("Message ready…"). */
  status: ReactNode;
}) {
  const message = askInviteMessage(account.email);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [emailCopied, setEmailCopied] = useState(false);

  const copy = async (value: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  };

  const sendWhatsapp = () => {
    window.open(whatsappShareUrl(message), '_blank', 'noopener,noreferrer');
    onAsked('whatsapp');
  };

  return (
    <Split
      left={
        <>
          <BackLink onClick={onBack} />
          <Heading>Ask your team to invite you</Heading>
          <Lede>The team owner adds you from Team, then Invite. Send them this.</Lede>
          <Chips account={account} />
        </>
      }
      right={
        <>
          <div className="md:rounded-2xl md:border md:border-stroke-control md:bg-bg-surface md:p-4">
            <div className="space-y-2">
              <button type="button" onClick={sendWhatsapp} className={primaryButtonClass}>
                {icons.whatsapp}
                Send on WhatsApp
              </button>
              <button
                type="button"
                onClick={() => {
                  void copy(message).then(() => onAsked('copy'));
                }}
                className={secondaryButtonClass}
              >
                Copy message
              </button>
            </div>
            {status ? (
              <p role="status" className="mt-2 text-center text-[13px] text-content-secondary">
                {status}
              </p>
            ) : null}
            <span className={`${labelClass} mt-[18px]`}>What they get</span>
            <p className="rounded-xl border border-dashed border-stroke-control bg-bg-base px-3.5 py-3 text-sm text-content-secondary">
              {message}
            </p>
            <span className={`${labelClass} mt-4`}>Your email</span>
            <div className="flex items-center gap-2 rounded-xl border border-stroke-control bg-bg-base py-1 pl-3.5 pr-1">
              <span className="min-w-0 flex-1 truncate text-[15px]">{account.email}</span>
              <button
                type="button"
                onClick={() => void copy(account.email).then((ok) => setEmailCopied(ok))}
                className="min-h-10 rounded-full px-3 text-sm font-semibold text-content-primary hover:bg-bg-hover"
              >
                {emailCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            {linkOpen ? (
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (link.trim() && !linkBusy) onJoinLink(link);
                }}
              >
                <label className={labelClass} htmlFor="invite-link">
                  Paste the link here
                </label>
                <div className="flex gap-2">
                  <input
                    id="invite-link"
                    type="url"
                    inputMode="url"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    placeholder="my.urganize.app/invite/…"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={inputClass}
                  />
                  <button type="submit" disabled={!link.trim() || linkBusy} className={`${smallSecondaryClass} min-h-12 shrink-0`}>
                    {linkBusy ? 'Joining…' : 'Join'}
                  </button>
                </div>
                {linkError ? (
                  <p role="alert" className={errorTextClass}>
                    {linkError}
                  </p>
                ) : null}
              </form>
            ) : (
              <p className="mt-4 text-center">
                <button type="button" onClick={() => setLinkOpen(true)} className={`${textLinkClass} text-sm`}>
                  Got an invite link?
                </button>
              </p>
            )}
          </div>
          <div role="status" className={`${surfaceClass} mt-2.5 flex items-start gap-3 p-4`}>
            {longWait ? <span className="shrink-0 text-status-warning">{icons.whatsapp}</span> : <Spinner />}
            <div>
              <p className="font-semibold">{longWait ? 'No invite yet' : 'Waiting for your invite'}</p>
              <p className="text-[13.5px] text-content-secondary">
                {longWait
                  ? 'Send the message again? Owners often miss the first one.'
                  : 'This page updates by itself. You can close it and come back.'}
              </p>
              {longWait ? (
                <button type="button" onClick={sendWhatsapp} className={`${smallSecondaryClass} mt-2.5`}>
                  Send on WhatsApp again
                </button>
              ) : null}
            </div>
          </div>
          <p className="mt-5 text-center text-sm text-content-secondary">
            <button type="button" onClick={onUseDifferentEmail} className={textLinkClass}>
              Use a different email
            </button>
            {' · '}
            <button type="button" onClick={onBack} className={textLinkClass}>
              Create my own team instead
            </button>
          </p>
          <BottomChip account={account} />
        </>
      }
    />
  );
}

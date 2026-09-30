'use client';

import { useMemo, useState } from 'react';
import { KeyRound, Loader2 } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { getRolePermissions } from '@/lib/role-permissions';
import {
  MAX_LOGIN_LABEL_LENGTH,
  TEAM_LOGINS_ENABLED,
  daysUntilExpiry,
  type TeamLogin,
} from '@/lib/team-logins';
import { panelClass } from '@/components/settings/panelClass';
import { ShareLoginActions } from './ShareLoginActions';
import { useTeamLogins } from './useTeamLogins';

/**
 * Team logins — generate as many sign-in links as you need (founder request,
 * 2026-08-16).
 *
 * Sits below Teammates in Settings → Team, and the split between the two is
 * the thing to preserve: Teammates is WHO is already on the roster; this is
 * the stack of unused keys you hand out. They read the same workspace but
 * answer different questions, which is why this is a sibling section rather
 * than more controls bolted onto the invite form.
 *
 * There are no passwords anywhere in this feature. Each link is a URL the
 * manager pastes into WhatsApp or an email; the person opening it chooses
 * their own password on /invite/accept. Nothing this screen produces is
 * readable as a credential by anyone who later scrolls that chat.
 */
export function TeamLoginsSection() {
  const user = useAuthStore((state) => state.user);
  const workspaceName = useWorkspaceIdentityStore((state) => state.name);

  const rolePermissions = useMemo(() => getRolePermissions(user?.role), [user?.role]);
  const canManage = rolePermissions.role === 'manager';

  const [label, setLabel] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

  const { logins, isLoading, error, degraded, generate, revoke } = useTeamLogins(canManage);

  // Hooks above every early return — the section self-gates the same way its
  // siblings do, but a conditional hook call would break the rules of hooks.
  if (!TEAM_LOGINS_ENABLED) return null;
  // Read-only teammates never see this at all. Unlike the Teammates list —
  // which every teammate can see, so the roster is a shared surface — a stack
  // of live sign-in links is only ever the manager's business.
  if (!user || !canManage) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    await generate({ label: label.trim() });
    setLabel('');
    setIsGenerating(false);
  };

  const handleRevoke = async (id: string) => {
    setPendingRevokeId(id);
    await revoke(id);
    setPendingRevokeId(null);
  };

  const activeLogins = logins.filter((login) => login.state === 'active');
  const pastLogins = logins.filter((login) => login.state !== 'active');

  return (
    <section id="team-logins" className={`${panelClass} scroll-mt-24`}>
      <h2 className="mb-1 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
        Team logins
      </h2>
      <p className="mb-5 max-w-prose text-sm leading-6 text-content-secondary">
        Create as many logins as you need and send one to each person on WhatsApp or by
        email. They open the link, pick their own password, and they&apos;re in. You never
        have to send a password yourself.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={MAX_LOGIN_LABEL_LENGTH}
          placeholder="Who's this for? (optional, e.g. Tolu, publicist)"
          aria-label="Who is this login for?"
          className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={isGenerating}
          className="motion-focus inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Creating…
            </>
          ) : (
            'Generate login'
          )}
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm text-status-error"
        >
          {error}
        </p>
      ) : null}

      {degraded ? (
        <p className="mt-3 rounded-lg border border-status-warning/35 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
          Saved logins aren&apos;t available in this environment yet. New links still work.
          Copy one as soon as you create it.
        </p>
      ) : null}

      {isLoading && logins.length === 0 ? (
        <div className="mt-4 space-y-2" aria-hidden="true">
          {[0, 1].map((index) => (
            <div key={index} className="h-[86px] animate-pulse rounded-lg bg-bg-elevated" />
          ))}
        </div>
      ) : logins.length === 0 ? (
        <p className="mt-4 text-sm text-content-secondary">
          No logins yet. Generate one above and send it to whoever needs access.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          {activeLogins.length > 0 ? (
            <div className="space-y-2">
              {activeLogins.map((login) => (
                <LoginRow
                  key={login.id}
                  login={login}
                  workspaceName={workspaceName}
                  inviterName={user.name || null}
                  isRevoking={pendingRevokeId === login.id}
                  onRevoke={() => void handleRevoke(login.id)}
                />
              ))}
            </div>
          ) : null}

          {pastLogins.length > 0 ? (
            <div className="space-y-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-content-tertiary">
                No longer usable
              </p>
              {pastLogins.map((login) => (
                <LoginRow
                  key={login.id}
                  login={login}
                  workspaceName={workspaceName}
                  inviterName={user.name || null}
                  isRevoking={false}
                  onRevoke={null}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

type LoginRowProps = {
  login: TeamLogin;
  workspaceName: string | null;
  inviterName: string | null;
  isRevoking: boolean;
  /** Null for links that are already dead — nothing left to revoke. */
  onRevoke: (() => void) | null;
};

function LoginRow({ login, workspaceName, inviterName, isRevoking, onRevoke }: LoginRowProps) {
  const isActive = login.state === 'active';
  const daysLeft = daysUntilExpiry(login.expiresAt);

  return (
    <div className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-content-primary">
            {login.label || 'Unlabelled login'}
          </p>
          <p className="mt-0.5 text-xs text-content-secondary">
            {login.releaseTitle ? `For ${login.releaseTitle} · ` : ''}
            {login.state === 'revoked'
              ? 'Revoked'
              : login.state === 'expired'
                ? 'Expired'
                : daysLeft === null
                  ? 'No expiry'
                  : daysLeft <= 1
                    ? 'Expires today'
                    : `${daysLeft} days left`}
          </p>
        </div>
        {onRevoke ? (
          <button
            type="button"
            onClick={onRevoke}
            disabled={isRevoking}
            className="motion-focus shrink-0 text-xs text-status-error transition-opacity hover:underline disabled:opacity-60"
          >
            {isRevoking ? 'Revoking…' : 'Revoke'}
          </button>
        ) : null}
      </div>

      {/* A dead link keeps its row — so the manager can see they revoked it
          rather than wondering where it went — but loses every share control,
          because the one thing that must not happen is pasting a link that
          silently won't work. */}
      {isActive ? (
        <div className="mt-3">
          <ShareLoginActions
            url={login.url}
            workspaceName={workspaceName}
            releaseTitle={login.releaseTitle}
            inviterName={inviterName}
          />
        </div>
      ) : null}
    </div>
  );
}

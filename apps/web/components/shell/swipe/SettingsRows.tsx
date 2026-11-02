'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_NAV_ITEMS } from '@/components/admin/AdminNav';
import { SecuritySection } from '@/components/settings/SecuritySection';
import { DataExportSection } from '@/components/settings/DataExportSection';
import { LeaveTeamSection } from '@/components/settings/LeaveTeamSection';
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection';
import { TeamBriefSection } from '@/components/settings/TeamBriefSection';
import { WhatsappChasingSection } from '@/components/settings/WhatsappChasingSection';
import { isTeamBriefEnabled } from '@/lib/team-brief';
import { supabase } from '@/lib/supabase/client';
import { ThemeToggle } from '@urganize/ui';
import { useAuthStore } from '@/lib/auth-store';
import { errorMessage } from '@/lib/errors';
import { pushStatusLabel } from '@/lib/push-status-label';
import { AccountPhotoSettings } from '@/components/settings/AccountPhotoSettings';
import { usePushToggle } from '@/components/settings/PushNotificationsSection';
import { SwipeSheet } from './SwipeSheet';

// The phone Settings page's settings as grouped rows (Nov 2, 2026, founder
// approved docs/mocks/settings-rows): label on the left, value on the right,
// a tap on a row opens a small sheet with one field and Save. Profile and
// Notifications first; the other settings keep their current forms for now.
// The pop-up on a computer keeps its forms.

export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="mb-3 rounded-[20px] bg-content-primary/[0.04] px-4">{children}</div>;
}

export function Row({
  label,
  value,
  onClick,
  danger = false,
}: {
  label: string;
  value?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
}) {
  const body = (
    <>
      <span className={danger ? 'text-status-error' : 'text-content-primary/60'}>{label}</span>
      <span className="min-w-0 truncate text-right text-content-primary">{value}</span>
    </>
  );
  const className =
    'flex min-h-[54px] w-full items-center justify-between gap-4 border-b border-content-primary/[0.07] text-left text-[16px] last:border-b-0';
  return onClick ? (
    <button type="button" onClick={onClick} className={`motion-press ${className}`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

function AddPill() {
  return <span className="rounded-full bg-content-primary/[0.08] px-3.5 py-1.5 text-[14px]">Add</span>;
}

/** One field in a sheet, with Save. */
function EditSheet({
  open,
  title,
  initial,
  placeholder,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: string;
  placeholder?: string;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openedWith, setOpenedWith] = useState<string | null>(null);
  // Each opening starts from the saved value.
  if (open && openedWith === null) {
    setOpenedWith(initial);
    setValue(initial);
    setError('');
  }
  if (!open && openedWith !== null) setOpenedWith(null);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(`${title} cannot be empty.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(errorMessage(err, `Could not save your ${title.toLowerCase()}.`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SwipeSheet open={open} label={title} onClose={onClose} desktop="phone">
      <p className="text-[17px] font-semibold text-content-primary">{title}</p>
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={title}
        className="mt-3 h-12 w-full rounded-xl border border-stroke-control bg-bg-base px-4 text-[16px] text-content-primary outline-none focus:border-brand"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-status-error">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || value.trim() === initial.trim()}
        className="motion-press mt-4 h-12 w-full rounded-full bg-brand text-[15px] font-semibold text-content-inverse disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </SwipeSheet>
  );
}

export function ProfileRows() {
  const user = useAuthStore((state) => state.user);
  const updateProfileName = useAuthStore((state) => state.updateProfileName);
  const updateArtistName = useAuthStore((state) => state.updateArtistName);
  const [editing, setEditing] = useState<'name' | 'artist' | null>(null);
  if (!user) return null;
  const artistName = String(user.artist_name || '').trim();

  return (
    <div>
      <div id="name" className="scroll-mt-4">
        <AccountPhotoSettings userId={user.id} name={user.name || user.email} />
      </div>
      <RowGroup>
        <Row label="Name" value={user.name || <AddPill />} onClick={() => setEditing('name')} />
        <Row label="Email" value={<span className="text-content-primary/70">{user.email}</span>} />
        {user.role === 'artist' ? (
          <Row label="Artist name" value={artistName || <AddPill />} onClick={() => setEditing('artist')} />
        ) : null}
      </RowGroup>
      <div id="theme" className="scroll-mt-4">
        <RowGroup>
          <div className="flex min-h-[54px] items-center justify-between gap-3 py-2 text-[16px]">
            <span className="text-content-primary/60">Appearance</span>
            <ThemeToggle compact />
          </div>
        </RowGroup>
      </div>

      <EditSheet
        open={editing === 'name'}
        title="Name"
        initial={user.name || ''}
        onClose={() => setEditing(null)}
        onSave={(value) => updateProfileName(value)}
      />
      <EditSheet
        open={editing === 'artist'}
        title="Artist name"
        initial={artistName}
        placeholder="e.g. Tems"
        onClose={() => setEditing(null)}
        onSave={(value) => updateArtistName(value)}
      />
    </div>
  );
}

/** An on/off switch, the right side of a row. */
function Switch({ on, busy, label, onToggle }: { on: boolean; busy: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${
        on ? 'bg-brand' : 'bg-content-primary/20'
      }`}
    >
      <span
        className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-[left] ${on ? 'left-[23px]' : 'left-[3px]'}`}
      />
    </button>
  );
}

export function NotificationRows() {
  const { native, shownStatus, isWorking, error, toggle, copy } = usePushToggle();
  if (shownStatus === null) return null;
  const canToggle = shownStatus === 'enabled' || shownStatus === 'disabled';
  return (
    <div>
      <RowGroup>
        <div className="flex min-h-[54px] items-center justify-between gap-4 py-2 text-[16px]">
          <span className="text-content-primary">Push on this phone</span>
          {canToggle ? (
            <Switch
              on={shownStatus === 'enabled'}
              busy={isWorking}
              label="Push notifications on this phone"
              onToggle={() => void toggle()}
            />
          ) : (
            <span className="text-sm text-content-primary/60">{pushStatusLabel(shownStatus, native)}</span>
          )}
        </div>
      </RowGroup>
      {copy[shownStatus] ? <p className="px-1 text-[13px] text-content-primary/60">{copy[shownStatus]}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 px-1 text-sm text-status-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── The rest of the settings as rows (Nov 2, 2026, founder: "do all") ───────
// Each row opens its existing form in a sheet, so every setting reads as the
// same short list of rows, and nothing about how a form saves changes.

type SheetItem = { key: string; label: string; value?: ReactNode; danger?: boolean; render: () => ReactNode };

/**
 * Rows that open in place, under the row (Codex review on #1040). A row once
 * opened stays mounted while folded, so a half-written form keeps its draft,
 * and `openSection` (a search result's section id, which the item keys match)
 * opens the right row straight away.
 */
function SheetRows({ groups, openSection }: { groups: SheetItem[][]; openSection?: string | null }) {
  const [openKey, setOpenKey] = useState<string | null>(openSection ?? null);
  const [visited, setVisited] = useState<string[]>(openSection ? [openSection] : []);
  const [lastSection, setLastSection] = useState(openSection ?? null);
  if ((openSection ?? null) !== lastSection) {
    setLastSection(openSection ?? null);
    if (openSection) {
      setOpenKey(openSection);
      if (!visited.includes(openSection)) setVisited([...visited, openSection]);
    }
  }
  const toggle = (key: string) => {
    setOpenKey((current) => (current === key ? null : key));
    if (!visited.includes(key)) setVisited([...visited, key]);
  };
  return (
    <div>
      {groups
        .filter((group) => group.length > 0)
        .map((group, index) => (
          <RowGroup key={index}>
            {group.map((item) => (
              <div key={item.key} id={item.key} className="scroll-mt-20 border-b border-content-primary/[0.07] last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggle(item.key)}
                  aria-expanded={openKey === item.key}
                  className="motion-press flex min-h-[54px] w-full items-center justify-between gap-4 text-left text-[16px]"
                >
                  <span className={item.danger ? 'text-status-error' : 'text-content-primary/60'}>{item.label}</span>
                  <span className="min-w-0 truncate text-right text-content-primary">
                    {item.value ?? <span className="text-content-primary/35">{openKey === item.key ? '\u2212' : '+'}</span>}
                  </span>
                </button>
                {visited.includes(item.key) ? (
                  <div className={openKey === item.key ? 'pb-4' : 'hidden'}>{item.render()}</div>
                ) : null}
              </div>
            ))}
          </RowGroup>
        ))}
    </div>
  );
}

/**
 * True when the signed-in person owns the team (an owner cannot leave it),
 * read from /api/team like the Leave team form itself, so it is known on every
 * plan setup (Codex review on #1040: the billing snapshot is not always there).
 */
function useIsTeamOwner(): boolean | null {
  const [owner, setOwner] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch('/api/team', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!response.ok) return;
        const team = (await response.json()) as { viewer?: { isOwner?: boolean } };
        if (live && typeof team.viewer?.isOwner === 'boolean') setOwner(team.viewer.isOwner);
      } catch {
        // Unknown: the row stays hidden, as the form itself would.
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return owner;
}

const DATA_EXPORT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DATA_EXPORT === 'true';

export function SecurityRows({ openSection }: { openSection?: string | null }) {
  const isOwner = useIsTeamOwner();
  return (
    <SheetRows
      openSection={openSection}
      groups={[
        [
          { key: 'password', label: 'Password', value: 'Change', render: () => <SecuritySection /> },
          ...(DATA_EXPORT_ENABLED
            ? [{ key: 'export', label: 'Download your data', render: () => <DataExportSection /> }]
            : []),
        ],
        [
          ...(isOwner === false
            ? [{ key: 'leave', label: 'Leave team', danger: true, render: () => <LeaveTeamSection /> }]
            : []),
          { key: 'delete-account', label: 'Delete account', danger: true, render: () => <DeleteAccountSection /> },
        ],
      ]}
    />
  );
}

export function UrgansRows({ openSection }: { openSection?: string | null }) {
  return (
    <SheetRows
      openSection={openSection}
      groups={[
        [
          ...(isTeamBriefEnabled()
            ? [{ key: 'team-brief', label: 'Teach UrgAns about your team', render: () => <TeamBriefSection /> }]
            : []),
          { key: 'chasing', label: 'WhatsApp chasing', render: () => <WhatsappChasingSection /> },
        ],
      ]}
    />
  );
}

export function AdminRows() {
  const router = useRouter();
  return (
    <RowGroup>
      {ADMIN_NAV_ITEMS.map((item) => (
        <Row key={item.key} label={item.label} value={<span className="text-content-primary/35">&rsaquo;</span>} onClick={() => router.push(item.href)} />
      ))}
    </RowGroup>
  );
}

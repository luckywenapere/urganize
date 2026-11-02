'use client';

import { useState, type ReactNode } from 'react';
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

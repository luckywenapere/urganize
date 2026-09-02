'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, UserCircle2 } from 'lucide-react';
import { getInitials, type WorkspaceMember } from '@/lib/tasks';

type TaskMemberSelectProps = {
  members: WorkspaceMember[];
  selectedMember: WorkspaceMember | null;
  onSelectMember: (member: WorkspaceMember | null) => void;
  label?: string;
  placeholder?: string;
  /** True while the members list is being fetched. Shows a hint in the menu. */
  isLoading?: boolean;
  /**
   * 'compact' renders the property-row variant used by TaskDetailView's
   * Linear-style metadata list: no visible label (the row supplies one) and a
   * slim ghost trigger that only shows its bounds on hover/focus. Default
   * 'comfortable' is the boxed form-field size — same precedent as TaskRow's
   * density prop.
   */
  density?: 'comfortable' | 'compact';
};

// Replaces the old TaskMemberCombobox, which was a text input doubling as a
// search box (founder request, 2026-08-29: "I don't think they should be able
// to type in that place. They should just open the dropdown... whenever I
// click on it, it just opens the keyboard and blocks the dropdown menu").
//
// On a phone the keyboard covered the very list you were trying to pick from,
// and search buys nothing here: every capped tier's seat ceiling is a small
// single digit (see `limits.seats` in @urganize/pricing — Solo is the tightest),
// so the list this scrolls is a handful of people. Removing the input also
// removes a whole bug class rather than guarding it — the seeded-query filter
// bug fixed hours earlier in v1.5.2, and the blur-clears-the-assignee hazard
// beside it, both existed only because the display and the filter were the
// same field.
//
// Structurally NoteReleasePicker (components/notes/NoteReleasePicker.tsx): a
// button trigger over a role="listbox" panel, outside-click to close, Escape
// closes only the menu and returns focus. Options are real buttons, so Tab
// and Enter work without a roving-focus implementation.

// When on, the menu shows every non-removed member the API returns (matching
// Settings) and renders invited-but-not-joined rows disabled. When off, the
// legacy behavior holds: only status==='active' members appear.
const WORKSPACE_FEATURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// Assigning writes `tasks.assigned_to_user_id`, which needs a real user.
// Invited members have a null user_id until they accept, so they render
// visible-but-disabled: the manager can see who has been invited without
// being able to assign work to a user that does not exist yet.
function isSelectable(member: WorkspaceMember): boolean {
  return Boolean(member.userId);
}

function MemberAvatar({ member }: { member: WorkspaceMember }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-bg-elevated text-[10px] font-semibold text-content-primary">
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        getInitials(member.name || member.email)
      )}
    </span>
  );
}

export function TaskMemberSelect({
  members,
  selectedMember,
  onSelectMember,
  label = 'Assignee',
  placeholder = 'Unassigned',
  isLoading = false,
  density = 'comfortable',
}: TaskMemberSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const visibleMembers = WORKSPACE_FEATURE_ENABLED
    ? members
    : members.filter((member) => member.status === 'active');

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Claim Escape only while the menu is open, and stop it there: an
        // enclosing modal owns Escape otherwise, and closing both at once
        // would eject the user from the activity they are editing.
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const choose = (member: WorkspaceMember | null) => {
    if (member && !isSelectable(member)) {
      return;
    }
    onSelectMember(member);
    setOpen(false);
  };

  const triggerClass =
    density === 'compact'
      ? 'motion-focus flex h-9 w-full items-center gap-2 rounded-lg border border-transparent bg-transparent px-2 text-left text-sm text-content-primary transition-colors hover:border-stroke-default hover:bg-bg-elevated focus:border-brand focus:bg-bg-elevated'
      : 'motion-focus input flex h-12 items-center gap-2 rounded-[18px] text-left';

  return (
    <div ref={rootRef} className="relative">
      {density === 'comfortable' ? (
        <span className="mb-2 block text-sm font-semibold text-content-primary">{label}</span>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selectedMember ? `${label}: ${selectedMember.name}` : label}
        className={triggerClass}
      >
        {selectedMember ? (
          <MemberAvatar member={selectedMember} />
        ) : (
          <UserCircle2 className="h-5 w-5 shrink-0 text-content-tertiary" aria-hidden="true" />
        )}
        <span
          className={`min-w-0 flex-1 truncate ${
            selectedMember ? 'text-content-primary' : 'text-content-tertiary'
          }`}
        >
          {selectedMember ? selectedMember.name : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 max-h-[16rem] overflow-y-auto overscroll-contain rounded-[18px] border border-stroke-default bg-bg-surface py-1 shadow-[0_28px_70px_-40px_rgb(var(--shadow-ink)/calc(0.78*var(--shadow-alpha-scale)))]"
        >
          {isLoading && visibleMembers.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-content-secondary">Loading teammates…</p>
          ) : null}

          <button
            type="button"
            role="option"
            aria-selected={!selectedMember}
            onClick={() => choose(null)}
            className={`motion-focus flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-bg-hover ${
              !selectedMember ? 'text-content-primary' : 'text-content-secondary'
            }`}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-stroke-default text-[10px] text-content-tertiary">
              --
            </span>
            Unassigned
          </button>

          {visibleMembers.map((member) => {
            const selectable = isSelectable(member);
            const selected = selectedMember?.id === member.id;
            return (
              <button
                key={member.id}
                type="button"
                role="option"
                aria-selected={selected}
                aria-disabled={!selectable || undefined}
                onClick={() => choose(member)}
                className={`motion-focus flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  selectable
                    ? 'hover:bg-bg-hover'
                    : 'cursor-not-allowed opacity-60'
                }`}
              >
                <MemberAvatar member={member} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm ${
                      selected ? 'font-semibold text-content-primary' : 'text-content-primary'
                    }`}
                  >
                    {member.name}
                  </span>
                  {!selectable ? (
                    <span className="mt-0.5 block truncate text-[11px] uppercase tracking-[0.16em] text-content-tertiary">
                      Pending invite — can&apos;t assign yet
                    </span>
                  ) : (
                    <span className="mt-0.5 block truncate text-xs text-content-secondary">
                      {member.email}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

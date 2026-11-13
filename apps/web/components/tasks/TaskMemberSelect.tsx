'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, UserCircle2 } from '@/components/icons';
import { getInitials, type WorkspaceMember } from '@/lib/tasks';
import { ThumbImage } from '@/components/shared/ThumbImage';

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
  /** Replaces the trigger's classes: the desktop pop-up's boxed field (#1251). */
  triggerClassName?: string;
  /**
   * Rendered at the base of the open menu, BELOW and OUTSIDE the list.
   * TaskDetailView passes its invite-a-teammate form here (2026-09-05): the
   * moment you want someone who is not on the list is the moment you are
   * looking at the list, so the form belongs here rather than sitting
   * permanently in the activity body.
   *
   * Outside the list is not a style choice: the list scrolls on its own, so an
   * expanded form squeezes it instead of being pushed off the bottom.
   */
  footer?: ReactNode;
  /**
   * Shown on the trigger when no teammate is picked but someone outside the
   * app has the activity (chase by number, #1119), e.g. "Kemi · WhatsApp".
   */
  selectedLabel?: string | null;
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
// button trigger over a panel, outside-click to close, Escape closes only the
// menu and returns focus. Rows are real buttons, so Tab and Enter work without
// a roving-focus implementation. It is a disclosure and not a role="listbox"
// on purpose: a listbox promises arrow-key movement between its options, and
// these never had it.

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
  // A photo that fails to load (an expired signed link) falls back to the
  // initials, keyed by url so a fresh link gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = member.avatarUrl && failedUrl !== member.avatarUrl ? member.avatarUrl : null;
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full bg-bg-elevated text-[10px] font-semibold text-content-primary">
      {photo ? (
        <ThumbImage
          src={photo}
          width={24}
          height={24}
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(photo)}
        />
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
  footer,
  selectedLabel = null,
  triggerClassName,
}: TaskMemberSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

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

  const triggerClass = triggerClassName
    ? triggerClassName
    : density === 'compact'
      ? 'motion-focus flex h-9 w-full items-center gap-2 rounded-lg border border-transparent bg-transparent px-2 text-left text-sm text-content-primary transition-colors [@media(hover:hover)]:hover:border-stroke-default [@media(hover:hover)]:hover:bg-bg-elevated focus:border-brand focus:bg-bg-elevated'
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
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // Carries the words shown on the button, so voice control can reach it.
        aria-label={selectedMember ? `${label}: ${selectedMember.name}` : `${label}: ${selectedLabel || placeholder}`}
        className={triggerClass}
      >
        {selectedMember ? (
          <MemberAvatar member={selectedMember} />
        ) : (
          <UserCircle2 className="h-5 w-5 shrink-0 text-content-tertiary" aria-hidden="true" />
        )}
        <span
          className={`min-w-0 flex-1 truncate ${
            selectedMember || selectedLabel ? 'text-content-primary' : 'text-content-tertiary'
          }`}
        >
          {selectedMember ? selectedMember.name : selectedLabel || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        // The scroll lives on the LIST, not on this wrapper, so an expanded
        // footer squeezes the list instead of being pushed off the bottom of
        // the menu (the WorkspaceNavList move). The cap is viewport-relative
        // because the invite form grows this panel and a fixed rem cap can
        // outrun a short phone.
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 flex max-h-[min(24rem,60dvh)] flex-col overflow-hidden rounded-[18px] border border-stroke-default bg-bg-surface shadow-[0_28px_70px_-40px_rgb(var(--shadow-ink)/calc(0.78*var(--shadow-alpha-scale)))]">
          <div
            id={panelId}
            role="group"
            aria-label={label}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
          >
            {isLoading && visibleMembers.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-content-secondary">Loading teammates…</p>
            ) : null}

            <button
              type="button"
              aria-current={!selectedMember && !selectedLabel ? 'true' : undefined}
              onClick={() => choose(null)}
              className={`motion-focus flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-bg-hover ${
                !selectedMember ? 'text-content-primary' : 'text-content-secondary'
              }`}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-dashed border-stroke-default text-[10px] text-content-tertiary">
                --
              </span>
              <span className="min-w-0 flex-1">Unassigned</span>
              {!selectedMember && !selectedLabel ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
            </button>

            {visibleMembers.map((member) => {
              const selectable = isSelectable(member);
              const selected = selectedMember?.id === member.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  aria-current={selected ? 'true' : undefined}
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
                        Pending invite. Can&apos;t assign yet.
                      </span>
                    ) : (
                      <span className="mt-0.5 block truncate text-xs text-content-secondary">
                        {member.email}
                      </span>
                    )}
                  </span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          {footer ? (
            <div className="shrink-0 border-t border-stroke-subtle">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

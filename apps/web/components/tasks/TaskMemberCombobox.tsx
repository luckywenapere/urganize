'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { getInitials, type WorkspaceMember } from '@/lib/tasks';

type TaskMemberComboboxProps = {
  members: WorkspaceMember[];
  selectedMember: WorkspaceMember | null;
  query: string;
  onQueryChange: (value: string) => void;
  onSelectMember: (member: WorkspaceMember | null) => void;
  label?: string;
  placeholder?: string;
};

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

export function TaskMemberCombobox({
  members,
  selectedMember,
  query,
  onQueryChange,
  onSelectMember,
  label = 'Assignee',
  placeholder = 'Search teammates',
}: TaskMemberComboboxProps) {
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const activeMembers = useMemo(() => members.filter((member) => member.status === 'active'), [members]);
  const normalizedQuery = normalizeValue(query);

  const filteredMembers = useMemo(() => {
    if (!normalizedQuery) {
      return activeMembers;
    }

    return activeMembers.filter((member) => {
      const searchable = `${member.name} ${member.email}`.toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [activeMembers, normalizedQuery]);

  const items = useMemo(() => {
    return [null, ...filteredMembers] as Array<WorkspaceMember | null>;
  }, [filteredMembers]);

  useEffect(() => {
    if (!isOpen) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex((current) => {
      if (!items.length) {
        return -1;
      }

      if (current < 0 || current >= items.length) {
        return 0;
      }

      return current;
    });
  }, [isOpen, items]);

  const commitSelection = (member: WorkspaceMember | null) => {
    onSelectMember(member);
    onQueryChange(member ? member.name : '');
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (containerRef.current?.contains(activeElement)) {
        return;
      }

      if (!query.trim()) {
        commitSelection(null);
        return;
      }

      const exactMatch =
        activeMembers.find((member) => normalizeValue(member.name) === normalizeValue(query)) || null;
      if (exactMatch) {
        commitSelection(exactMatch);
        return;
      }

      onQueryChange(selectedMember?.name || '');
      setIsOpen(false);
      setActiveIndex(-1);
    }, 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => {
        if (!items.length) {
          return -1;
        }

        return current < items.length - 1 ? current + 1 : 0;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => {
        if (!items.length) {
          return -1;
        }

        return current > 0 ? current - 1 : items.length - 1;
      });
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const activeItem = activeIndex >= 0 ? items[activeIndex] : items[0] || null;
      commitSelection(activeItem || null);
    }
  };

  const activeOptionId =
    isOpen && activeIndex >= 0 && items[activeIndex] !== undefined ? `${baseId}-option-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-content-primary">{label}</span>
        <input
          type="text"
          role="combobox"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          className="input h-12 rounded-[18px]"
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.6rem)] z-20 overflow-hidden rounded-[24px] border border-stroke-default bg-bg-surface/98 shadow-[0_28px_70px_-40px_rgba(0,0,0,0.78)]">
          <div id={listboxId} role="listbox" className="max-h-[18rem] overflow-y-auto p-2">
            {items.map((item, index) => {
              const isActive = index === activeIndex;
              if (!item) {
                return (
                  <button
                    key="unassigned"
                    id={`${baseId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={!selectedMember}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commitSelection(null)}
                    className={`flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition ${
                      isActive ? 'bg-brand-muted text-content-primary' : 'hover:bg-bg-elevated text-content-primary'
                    }`}
                  >
                    <div className="grid h-10 w-10 place-items-center rounded-full border border-dashed border-stroke-default bg-bg-elevated text-xs font-semibold text-content-tertiary">
                      --
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Unassigned</p>
                      <p className="mt-1 text-xs text-content-secondary">No teammate currently owns this task.</p>
                    </div>
                  </button>
                );
              }

              return (
                <button
                  key={item.id}
                  id={`${baseId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={selectedMember?.id === item.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commitSelection(item)}
                  className={`flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition ${
                    isActive ? 'bg-brand-muted' : 'hover:bg-bg-elevated'
                  }`}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-bg-elevated text-sm font-semibold text-content-primary">
                    {item.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.avatarUrl} alt={item.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      getInitials(item.name || item.email)
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-content-primary">{item.name}</p>
                    <p className="mt-1 truncate text-xs text-content-secondary">{item.email}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

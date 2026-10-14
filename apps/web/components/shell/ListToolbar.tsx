'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, SlidersHorizontal, X } from '@/components/icons';
import { DialogPanel } from '@/components/shared/DialogPanel';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { placeUnderAnchor } from '@/lib/menu-position';
import {
  activeFilterCount,
  filtersButtonLabel,
  inlineBreakpoint,
  isChanged,
  isFilterActive,
  selectedLabel,
  type ToolbarControl,
  type ToolbarSelect,
} from '@/lib/list-toolbar';
import { PAGE_HEADER_SLOT_TOOLS } from './PageHeader';
import { SUBNAV_SLOT_TOOLS } from './SubNav';

export type { ToolbarControl } from '@/lib/list-toolbar';

type ListToolbarProps = {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    /** Read out for the box. Defaults to the placeholder. */
    label?: string;
  };
  controls?: ToolbarControl[];
  /** Computer-only extras drawn after the filters (e.g. Table / Cards). */
  extra?: ReactNode;
  /** Spacing around the phone row, which stays in the page. */
  className?: string;
  /** Replaces the phone row, for a page whose one filter reads better as a
   *  sideways-scrolling chip row (Shows' artists). */
  phoneRow?: ReactNode;
  /** Draw every control inline only from this width, for a tab row that is
   *  already busy (Rollouts carries a count and Add rollout as well). */
  inlineFrom?: 'xl' | '2xl';
};

// Static class names, so Tailwind sees every one of them.
const SHOW_FROM = { lg: 'lg:flex', xl: 'xl:flex', '2xl': '2xl:flex' } as const;
const HIDE_FROM = { lg: 'lg:hidden', xl: 'xl:hidden', '2xl': '2xl:hidden' } as const;

/**
 * One list page's search and filters (founder mock, 2026-10-11).
 *
 * On a computer it moves up into the empty right side of the section tab row,
 * or the page header's line when the area has no tab row, as a compact search
 * box and small pills; when there are more pills than fit beside the tabs, the
 * narrower screens get one Filters button that opens them in a small panel.
 *
 * On a phone it is one row: the search box and a single Filters (or Sort)
 * button, with a count of the filters that are set, opening a bottom sheet that
 * holds the dropdowns. Nothing stacks full width any more.
 */
export function ListToolbar({ search, controls = [], extra, className = '', phoneRow: customPhoneRow, inlineFrom }: ListToolbarProps) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setSlot(document.getElementById(SUBNAV_SLOT_TOOLS) ?? document.getElementById(PAGE_HEADER_SLOT_TOOLS));
  }, []);
  const [sheetOpen, setSheetOpen] = useState(false);

  const clearFilters = useCallback(() => {
    for (const control of controls) {
      if (!isFilterActive(control)) continue;
      if (control.kind === 'toggle') control.onToggle(false);
      else control.onChange(control.defaultValue ?? '');
    }
  }, [controls]);

  const count = activeFilterCount(controls);
  const label = filtersButtonLabel(controls);
  // A page with no search and a single filter (Shows' artist) names the
  // choice on the button itself, so the row is not a lone "Filters".
  const lone = !search && controls.length === 1 && controls[0].kind !== 'toggle' ? controls[0] : null;

  const phoneRow = customPhoneRow ?? (
    <div className="flex items-center gap-2">
      {search ? <SearchBox {...search} size="phone" /> : null}
      {controls.length > 0 ? (
        <FiltersButton
          label={lone ? selectedLabel(lone) : label}
          count={lone ? 0 : count}
          size="phone"
          active={lone ? isChanged(lone) : count > 0}
          onClick={() => setSheetOpen(true)}
        />
      ) : null}
    </div>
  );

  const desktopRow = (
    <DesktopRow search={search} controls={controls} extra={extra} inlineFrom={inlineFrom} count={count} label={label} onClear={clearFilters} />
  );

  return (
    <>
      <div className={`${slot ? 'lg:hidden' : ''} ${className}`}>
        <div className={slot ? '' : 'lg:hidden'}>{phoneRow}</div>
        {slot ? null : <div className="hidden lg:flex lg:justify-end">{desktopRow}</div>}
      </div>
      {slot ? createPortal(desktopRow, slot) : null}
      {sheetOpen ? (
        <FilterSheet
          title={lone ? lone.label : label}
          controls={controls}
          count={count}
          onClear={clearFilters}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  size,
}: NonNullable<ListToolbarProps['search']> & { size: 'phone' | 'desktop' }) {
  const phone = size === 'phone';
  return (
    <label className={`relative ${phone ? 'min-w-0 flex-1' : 'w-40 xl:w-56'}`}>
      <span className="sr-only">{label ?? placeholder}</span>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        // 16px on a phone, or iOS zooms the page when the box takes focus.
        className={`w-full rounded-full border border-stroke-control bg-bg-surface pl-9 pr-3 text-content-primary outline-none transition-colors placeholder:text-content-tertiary hover:border-content-secondary focus:border-brand ${
          phone ? 'h-11 text-lg' : 'h-9 text-sm'
        }`}
      />
    </label>
  );
}

function FiltersButton({
  label,
  count,
  size,
  active,
  onClick,
  buttonRef,
  expanded,
}: {
  label: string;
  count: number;
  size: 'phone' | 'desktop';
  active: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  expanded?: boolean;
}) {
  const phone = size === 'phone';
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={count > 0 ? `${label}, ${count} set` : label}
      className={`motion-focus motion-press inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition-colors ${
        phone ? 'h-11 px-4 text-sm' : 'h-9 px-3.5 text-sm'
      } ${
        active
          ? 'border-brand bg-brand/10 text-content-primary'
          : 'border-stroke-control text-content-secondary hover:border-content-secondary hover:text-content-primary'
      }`}
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="max-w-[9rem] truncate">{label}</span>
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 font-mono text-[11px] font-semibold tabular-nums text-content-inverse"
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function DesktopRow({
  search,
  controls,
  extra,
  inlineFrom,
  count,
  label,
  onClear,
}: {
  search: ListToolbarProps['search'];
  controls: ToolbarControl[];
  extra: ReactNode;
  inlineFrom?: 'xl' | '2xl';
  count: number;
  label: string;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bp = inlineFrom ?? inlineBreakpoint(controls);
  return (
    <div className="flex items-center gap-2">
      {search ? <SearchBox {...search} size="desktop" /> : null}
      {controls.length > 0 ? (
        <>
          <div className={`hidden items-center gap-2 ${SHOW_FROM[bp]}`}>
            {controls.map((control) => (
              <Pill key={control.key} control={control} />
            ))}
          </div>
          {bp === 'lg' ? null : (
            <div className={`hidden lg:flex ${HIDE_FROM[bp]}`}>
              <FiltersButton
                buttonRef={buttonRef}
                label={label}
                count={count}
                size="desktop"
                active={count > 0}
                expanded={open}
                onClick={() => setOpen((value) => !value)}
              />
            </div>
          )}
          {open ? (
            <FilterPopover
              anchor={buttonRef}
              title={label}
              controls={controls}
              count={count}
              onClear={onClear}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </>
      ) : null}
      {extra}
    </div>
  );
}

function Pill({ control }: { control: ToolbarControl }) {
  const changed = isChanged(control);
  const tone = changed
    ? 'border-brand bg-brand/10 text-content-primary'
    : 'border-stroke-control bg-bg-surface text-content-secondary hover:border-content-secondary hover:text-content-primary';
  if (control.kind === 'toggle') {
    return (
      <button
        type="button"
        aria-pressed={control.pressed}
        onClick={() => control.onToggle(!control.pressed)}
        className={`motion-focus inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors ${tone}`}
      >
        {control.pressed ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {control.label}
      </button>
    );
  }
  return (
    <span className="relative inline-flex shrink-0">
      <select
        value={control.value}
        onChange={(event) => control.onChange(event.target.value)}
        aria-label={control.label}
        className={`motion-focus h-9 max-w-[12rem] appearance-none truncate rounded-full border pl-3.5 pr-8 text-sm font-medium transition-colors ${tone}`}
      >
        {control.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
        aria-hidden="true"
      />
    </span>
  );
}

/** The dropdowns, full width and labelled, for the sheet and the popover. */
function Fields({ controls, phone }: { controls: ToolbarControl[]; phone: boolean }) {
  return (
    <div className="space-y-4">
      {controls.map((control) =>
        control.kind === 'toggle' ? (
          <button
            key={control.key}
            type="button"
            aria-pressed={control.pressed}
            onClick={() => control.onToggle(!control.pressed)}
            className={`motion-focus flex w-full items-center justify-between gap-3 rounded-xl border px-4 text-left font-medium transition-colors ${
              phone ? 'min-h-12 text-base' : 'min-h-10 text-sm'
            } ${
              control.pressed
                ? 'border-brand bg-brand/10 text-content-primary'
                : 'border-stroke-control text-content-secondary hover:border-content-secondary'
            }`}
          >
            {control.label}
            <span
              aria-hidden="true"
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                control.pressed ? 'border-brand bg-brand text-content-inverse' : 'border-stroke-control'
              }`}
            >
              {control.pressed ? <Check className="h-3 w-3" /> : null}
            </span>
          </button>
        ) : (
          <SelectField key={control.key} control={control} phone={phone} />
        )
      )}
    </div>
  );
}

function SelectField({ control, phone }: { control: ToolbarSelect; phone: boolean }) {
  const id = `list-toolbar-${control.key}-${phone ? 'p' : 'd'}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-content-secondary">
        {control.label}
      </label>
      <span className="relative block">
        <select
          id={id}
          value={control.value}
          onChange={(event) => control.onChange(event.target.value)}
          className={`motion-focus w-full appearance-none rounded-xl border bg-bg-base pl-4 pr-10 text-content-primary ${
            phone ? 'h-12 text-lg' : 'h-10 text-sm'
          } ${isChanged(control) ? 'border-brand' : 'border-stroke-control'}`}
        >
          {control.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
          aria-hidden="true"
        />
      </span>
    </div>
  );
}

export function FilterSheet({
  title,
  controls,
  count,
  onClear,
  onClose,
}: {
  title: string;
  controls: ToolbarControl[];
  count: number;
  onClear: () => void;
  onClose: () => void;
}) {
  useEffect(() => lockBodyScroll(), []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[170] lg:hidden">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <DialogPanel
        label={title}
        onClose={onClose}
        className="absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-env(safe-area-inset-top,0px)-1rem)] flex-col rounded-t-3xl border-t border-stroke-default bg-bg-surface pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3"
      >
        <div className="mx-auto mb-1 h-1 w-10 shrink-0 rounded-full bg-stroke-strong" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between px-4 pb-2">
          <h2 className="font-display text-xl font-semibold text-content-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-focus grid h-11 w-11 place-items-center rounded-full text-content-tertiary hover:bg-bg-hover"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <Fields controls={controls} phone />
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-stroke-subtle px-4 pt-3">
          {count > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="motion-focus motion-press inline-flex h-12 flex-1 items-center justify-center rounded-full border border-stroke-default text-sm font-semibold text-content-primary hover:bg-bg-hover"
            >
              Clear filters
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="motion-focus motion-press inline-flex h-12 flex-1 items-center justify-center rounded-full bg-content-primary text-sm font-semibold text-content-inverse hover:opacity-90"
          >
            Done
          </button>
        </div>
      </DialogPanel>
    </div>,
    document.body
  );
}

/** The computer's version of the sheet: a small panel under the button, used
 *  only on screens too narrow for every pill beside the tabs, and by the
 *  rollout plan's Filters button. Placed under its button and held inside the
 *  screen (lib/menu-position.ts), following the button when the page scrolls. */
export function FilterPopover({
  anchor,
  title,
  controls,
  count,
  onClear,
  onClose,
  align = 'end',
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  title: string;
  controls: ToolbarControl[];
  count: number;
  onClear: () => void;
  onClose: () => void;
  /** Which edge of the button the panel lines up with. */
  align?: 'start' | 'end';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const place = useCallback(() => {
    const rect = anchor.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!rect || !panel) return;
    const placed = placeUnderAnchor({
      anchor: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      panel: { width: panel.offsetWidth, height: panel.offsetHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      align,
    });
    setPosition((prev) => (prev && prev.top === placed.top && prev.left === placed.left ? prev : placed));
  }, [anchor, align]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        anchor.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    // Capture phase: scroll does not bubble, and the list may scroll inside a panel.
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, onClose, place]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      // Drawn hidden for the one frame before it is measured and placed.
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
      className="fixed z-[160] hidden max-h-[calc(100dvh-1rem)] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-stroke-default bg-bg-surface p-4 shadow-xl lg:block"
    >
      <Fields controls={controls} phone={false} />
      <div className="mt-4 flex items-center justify-end gap-2">
        {count > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="motion-focus inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            Clear filters
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="motion-focus motion-press inline-flex h-9 items-center rounded-full bg-content-primary px-4 text-sm font-semibold text-content-inverse hover:opacity-90"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
}

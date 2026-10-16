'use client';

import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useSceneOverlay } from '@/components/workspace/useSceneOverlay';
import { fixDestinationFor, type FixAvailability } from '@/lib/distribution-fix';
import {
  HANDOFF_ITEM_NOUNS,
  HANDOFF_LEAD_CHOICES,
  daysLate,
  formatDaysLate,
  formatHandoffDay,
  handoffDueDate,
  handoffHeader,
  localYmd,
  rowActionFor,
  rowActionLabel,
  sentCount,
  type HandoffItemKey,
  type HandoffItemView,
  type HandoffLeadDays,
  type HandoffMember,
  type HandoffPayload,
} from '@/lib/handoff';
import { HandoffSheet } from './HandoffSheet';
import { useHandoff, type HandoffChange } from './useHandoff';

// The same inlined flags the Fix buttons elsewhere read: an Upload button must
// only open a step that exists.
const SCENE_FLAGS = {
  metadata: process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true',
  song: process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true',
  coverArt: process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true',
};

const MONO = 'font-mono text-[11px] uppercase tracking-[0.08em]';
const MONO_SMALL = 'font-mono text-[10.5px] uppercase tracking-[0.08em]';
const ROW_BUTTON =
  'motion-focus motion-press inline-flex h-10 shrink-0 items-center whitespace-nowrap border border-stroke-strong px-3.5 text-[13px] font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-60';

/** Four faces in the mock's four colours, given out in the team's order (you
 *  first), so two people on one rollout never share a colour until a fifth. */
const FACE_TONES = ['bg-status-info', 'bg-status-warning', 'bg-status-error', 'bg-brand'] as const;

function Face({ member, tone, size = 22 }: { member: HandoffMember | null; tone?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size > 30 ? 13 : 10 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-content-inverse ${member && tone ? tone : 'bg-content-tertiary'}`}
    >
      {member?.initial ?? '?'}
    </span>
  );
}

function SentMark({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand text-content-inverse"
    >
      <svg viewBox="0 0 12 12" width={size * 0.64} height={size * 0.64} fill="none">
        <path d="M2.5 6.2 5 8.6 9.6 3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

type RowTone = { late: boolean };

function StatusDot({ item, late }: { item: HandoffItemView } & RowTone) {
  if (item.status === 'sent') return <SentMark />;
  if (late) return <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-status-error" />;
  if (item.status === 'missing') {
    return <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full border-[1.5px] border-content-tertiary" />;
  }
  if (item.status === 'approved') return <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-brand" />;
  return <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-content-primary" />;
}

const STATUS_WORD: Record<HandoffItemView['status'], string> = {
  missing: 'Missing',
  uploaded: 'Uploaded',
  approved: 'Approved',
  sent: 'Sent',
};

function statusTone(item: HandoffItemView, late: boolean): string {
  if (late) return 'text-status-error';
  if (item.status === 'missing') return 'text-content-secondary';
  if (item.status === 'uploaded') return 'text-content-primary';
  return 'text-brand';
}

const Tick = () => (
  <span className="text-brand" aria-label="done">
    ✓
  </span>
);
const Dash = () => <span aria-label="missing">—</span>;

/** The row's second line: what is there, in the fewest words. */
function Detail({ item }: { item: HandoffItemView }) {
  const detail = item.detail;
  if (detail.kind === 'master') {
    if (!detail.format) return <>No file yet</>;
    if (item.status === 'missing') return <span className="text-status-error">{`${detail.format} · wrong format`}</span>;
    return <>{detail.format}</>;
  }
  if (detail.kind === 'cover_art') {
    const size =
      detail.width && detail.height ? `${Math.round(detail.width)} × ${Math.round(detail.height)}` : null;
    if (!size && !detail.format) return <>No file yet</>;
    if (detail.problem) {
      const why =
        detail.problem === 'artwork_too_small'
          ? size
            ? 'needs 3000'
            : 'size unknown · upload again'
          : detail.problem === 'artwork_not_square'
            ? 'not square'
            : 'needs JPG or PNG';
      return <span className="text-status-error">{[size ?? detail.format, why].filter(Boolean).join(' · ')}</span>;
    }
    return (
      <>
        {[size, detail.format].filter(Boolean).join(' · ')}
        {item.status === 'uploaded' || item.status === 'approved' ? (
          <>
            {' · '}
            <span className="text-brand">Store-ready</span>
          </>
        ) : null}
      </>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-x-4 gap-y-1">
      <span>ISRC {detail.isrc ? <Tick /> : <Dash />}</span>
      <span>Credits {detail.credits ? <Tick /> : <Dash />}</span>
      {typeof detail.splits === 'number' ? (
        <span className="text-status-warning">{`Splits ${Math.round(detail.splits * 10) / 10}%`}</span>
      ) : (
        <span>Splits {detail.splits === 'ok' ? <Tick /> : <Dash />}</span>
      )}
      <span>Lyrics {detail.lyrics ? <Tick /> : <Dash />}</span>
    </span>
  );
}

type HandoffSectionProps = {
  releaseId: string;
  /** Opens the release-day sheet. Only for who may edit it (the owner). */
  onOpenDetails?: () => void;
  onChangeArtist?: () => void;
};

/**
 * "Handoff to distributor" at the top of the Distribute step (URG-322): the
 * three things a distributor needs, each with an owner, a due date counted back
 * from release day, a status and one action. The rules live in lib/handoff.ts;
 * the Upload and Fix buttons open the steps that already hold each thing, so
 * there is no second files area.
 */
export function HandoffSection({ releaseId, onOpenDetails, onChangeArtist }: HandoffSectionProps) {
  const { data, loadError, reload, change, isSaving } = useHandoff(releaseId);
  const [saveError, setSaveError] = useState('');

  if (loadError && !data) {
    return (
      <section
        aria-label="Handoff to distributor"
        className="border border-status-error/30 bg-status-error/5 p-4"
      >
        <p className="text-[15px] font-semibold text-content-primary" role="alert">
          Couldn’t load the handoff.
        </p>
        <p className="mt-1 text-[13px] text-content-secondary">Check your connection.</p>
        <button type="button" onClick={() => void reload()} className={`${ROW_BUTTON} mt-3.5`}>
          Try again
        </button>
      </section>
    );
  }

  if (!data) {
    return (
      <div aria-busy="true" aria-label="Loading the handoff">
        <div className="h-2.5 w-2/5 border border-stroke-default bg-bg-surface" />
        <div className="mt-2.5 h-7 w-[70%] border border-stroke-default bg-bg-surface" />
        <div className="mt-2 h-2.5 w-[55%] border border-stroke-default bg-bg-surface" />
        <div className="mt-3 h-0.5 bg-stroke-strong" />
        <div className="mt-4 h-[330px] border border-stroke-default bg-bg-surface sm:h-[234px]" />
      </div>
    );
  }

  const run = async (next: HandoffChange) => {
    setSaveError('');
    const error = await change(next);
    if (error) setSaveError(error);
  };

  return (
    <HandoffView
      releaseId={releaseId}
      data={data}
      isSaving={isSaving}
      saveError={saveError}
      onChange={run}
      onOpenDetails={onOpenDetails}
      onChangeArtist={onChangeArtist}
    />
  );
}

/** The loaded handoff. Exported so it can be rendered on its own. */
export function HandoffView({
  releaseId,
  data,
  isSaving,
  saveError,
  onChange,
  onOpenDetails,
  onChangeArtist,
}: {
  releaseId: string;
  data: HandoffPayload;
  isSaving: boolean;
  saveError: string;
  onChange: (next: HandoffChange) => Promise<void>;
  onOpenDetails?: () => void;
  onChangeArtist?: () => void;
}) {
  const { openScene } = useSceneOverlay();
  const today = localYmd();
  const statuses = data.items.map((item) => item.status);
  const header = handoffHeader({
    dueDate: data.dueDate,
    today,
    statuses,
    sentDates: data.items.map((item) => item.sentAt),
  });
  const sent = sentCount(statuses);
  const lateDays = data.dueDate ? daysLate(data.dueDate, today) : 0;
  const memberById = useMemo(() => new Map(data.members.map((member) => [member.userId, member])), [data.members]);
  const toneById = useMemo(
    () => new Map(data.members.map((member, index) => [member.userId, FACE_TONES[index % FACE_TONES.length]])),
    [data.members]
  );

  const leadAnchor = useRef<HTMLButtonElement>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const ownerAnchors = useRef<Partial<Record<HandoffItemKey, HTMLButtonElement | null>>>({});
  const ownerAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [ownerFor, setOwnerFor] = useState<HandoffItemKey | null>(null);

  const availability: FixAvailability = {
    ...SCENE_FLAGS,
    canEditDetails: Boolean(onOpenDetails),
    canChangeArtist: Boolean(onChangeArtist),
  };

  const fixAction = (item: HandoffItemView): (() => void) | null => {
    if (!item.fix) return null;
    if ('lyrics' in item.fix) {
      return SCENE_FLAGS.metadata ? () => openScene('metadata', releaseId, { field: 'lyrics' }) : null;
    }
    const destination = fixDestinationFor(item.fix.fieldPath, availability);
    if (!destination) return null;
    if (destination.kind === 'scene') return () => openScene(destination.scene, releaseId, { field: destination.field });
    if (destination.kind === 'details') return () => onOpenDetails?.();
    return () => onChangeArtist?.();
  };

  const actionFor = (item: HandoffItemView): { label: string; run: () => void } | null => {
    const action = rowActionFor(item.status);
    const label = rowActionLabel(item.key, action);
    if (!action || !label) return null;
    if (action === 'fix') {
      const go = fixAction(item);
      return go ? { label, run: go } : null;
    }
    // Approve and Mark sent need a release day (the task) and the right person.
    if (!item.canAct || !data.dueDate) return null;
    return { label, run: () => void onChange({ action: action === 'approve' ? 'approve' : 'send', item: item.key }) };
  };

  const rowLate = (item: HandoffItemView) => item.status !== 'sent' && lateDays > 0;

  const openOwner = (item: HandoffItemKey) => {
    ownerAnchorRef.current = ownerAnchors.current[item] ?? null;
    setOwnerFor(item);
  };

  if (header.kind === 'no_date') {
    return (
      <section aria-label="Handoff to distributor">
        <p className={`${MONO} text-content-tertiary`}>Handoff to distributor</p>
        <h3 className="mt-2 font-display text-2xl leading-tight text-content-primary sm:text-[30px]">
          Pick a release date first
        </h3>
        <p className="mt-2 text-sm text-content-secondary">Due dates count back from it.</p>
        {onOpenDetails ? (
          <button type="button" onClick={onOpenDetails} className={`${ROW_BUTTON} mt-4`}>
            Set release date
          </button>
        ) : null}
        <ul className="mt-5 border border-stroke-default bg-bg-surface opacity-55">
          {data.items.map((item) => (
            <li
              key={item.key}
              className="flex items-center justify-between border-t border-stroke-default px-4 py-3.5 first:border-t-0"
            >
              <span className="font-semibold text-content-primary">{item.label}</span>
              <span className={`${MONO} text-content-tertiary`}>—</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const title =
    header.kind === 'all_sent'
      ? 'All sent'
      : header.kind === 'late'
        ? formatDaysLate(header.days)
        : `Due ${formatHandoffDay(header.dueDate)}`;
  const metaParts =
    header.kind === 'all_sent'
      ? [
          header.sentOn ? `Sent ${formatHandoffDay(header.sentOn)}` : null,
          data.releaseDate ? `Release ${formatHandoffDay(data.releaseDate)}` : null,
        ]
      : header.kind === 'late'
        ? [`Was due ${formatHandoffDay(header.dueDate)}`, `${data.leadDays} days before release`]
        : [`${data.leadDays} days before release`];

  const ownerItem = ownerFor ? data.items.find((item) => item.key === ownerFor) ?? null : null;

  return (
    <section aria-label="Handoff to distributor">
      <div className="pb-3.5 sm:pb-[18px]">
        <p className={`${MONO} text-content-tertiary`}>Handoff to distributor</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <h3
            className={`font-display text-2xl leading-tight sm:text-[30px] ${header.kind === 'late' ? 'text-status-error' : 'text-content-primary'}`}
          >
            {title}
          </h3>
          <span className={`${MONO} shrink-0 whitespace-nowrap pb-1 text-content-secondary`}>{`${sent} of 3 sent`}</span>
        </div>
        <p className={`${MONO} mt-1.5 text-content-tertiary`}>
          {metaParts.filter(Boolean).join(' · ')}
          {data.canEditLead ? (
            <>
              {' · '}
              <button
                ref={leadAnchor}
                type="button"
                onClick={() => setLeadOpen(true)}
                aria-label="Edit the distributor lead time"
                className={`motion-focus ${MONO} text-content-secondary underline underline-offset-[3px] hover:text-content-primary`}
              >
                Edit
              </button>
            </>
          ) : null}
        </p>
        <div
          className="mt-2.5 h-0.5 bg-stroke-strong"
          role="progressbar"
          aria-label="Handoff sent"
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={sent}
        >
          <div className="h-0.5 bg-brand transition-[width] duration-base" style={{ width: `${Math.round((sent / 3) * 100)}%` }} />
        </div>
        {saveError ? (
          <p className="mt-2 text-xs text-status-error" role="alert">
            {saveError}
          </p>
        ) : null}
      </div>

      {/* Phone: stacked rows. */}
      <ul className="border border-stroke-default bg-bg-surface sm:hidden">
        {data.items.map((item) => {
          const late = rowLate(item);
          const owner = memberById.get(item.ownerUserId) ?? null;
          const action = actionFor(item);
          return (
            <li key={item.key} className="flex gap-3 border-t border-stroke-default p-4 first:border-t-0">
              <span className="flex w-3.5 shrink-0 justify-center pt-1.5">
                <StatusDot item={item} late={late} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-[15px] font-semibold ${item.status === 'sent' ? 'text-content-secondary' : 'text-content-primary'}`}
                  >
                    {item.label}
                  </span>
                  <span className={`${MONO} ${statusTone(item, late)}`}>{STATUS_WORD[item.status]}</span>
                </div>
                <div className={`${MONO_SMALL} mt-1 text-content-tertiary`}>
                  <Detail item={item} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 text-[13px]">
                    <OwnerControl
                      item={item}
                      owner={owner}
                      tone={toneById.get(item.ownerUserId)}
                      setAnchor={(node) => {
                        ownerAnchors.current[item.key] = node;
                      }}
                      onOpen={() => openOwner(item.key)}
                    />
                    <DueText item={item} late={late} lateDays={lateDays} dueDate={data.dueDate} />
                  </span>
                  {action ? (
                    <button type="button" onClick={action.run} disabled={isSaving} className={ROW_BUTTON}>
                      {action.label}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* sm and up: one table. */}
      <div className="hidden border border-stroke-default bg-bg-surface sm:block" role="table" aria-label="Handoff items">
        <div
          role="row"
          className={`${MONO} grid grid-cols-[20px_1fr_2.4fr_1fr_1fr_88px_112px] items-center gap-4 border-b border-stroke-default px-5 py-3 text-content-tertiary`}
        >
          <span role="columnheader" aria-label="State" />
          <span role="columnheader">Item</span>
          <span role="columnheader">File / fields</span>
          <span role="columnheader">Owner</span>
          <span role="columnheader">Due</span>
          <span role="columnheader">Status</span>
          <span role="columnheader" aria-label="Action" />
        </div>
        {data.items.map((item) => {
          const late = rowLate(item);
          const owner = memberById.get(item.ownerUserId) ?? null;
          const action = actionFor(item);
          return (
            <div
              key={item.key}
              role="row"
              className="grid h-16 grid-cols-[20px_1fr_2.4fr_1fr_1fr_88px_112px] items-center gap-4 border-b border-stroke-default px-5 last:border-b-0"
            >
              <span role="cell" className="flex items-center">
                <StatusDot item={item} late={late} />
              </span>
              <span
                role="cell"
                className={`truncate text-[15px] font-semibold ${item.status === 'sent' ? 'text-content-secondary' : 'text-content-primary'}`}
              >
                {item.label}
              </span>
              <span role="cell" className={`${MONO_SMALL} min-w-0 text-content-tertiary`}>
                <Detail item={item} />
              </span>
              <span role="cell" className="flex min-w-0 items-center gap-2 text-sm">
                <OwnerControl
                  item={item}
                  owner={owner}
                  tone={toneById.get(item.ownerUserId)}
                  caret
                  setAnchor={(node) => {
                    ownerAnchors.current[item.key] = node;
                  }}
                  onOpen={() => openOwner(item.key)}
                />
              </span>
              <span role="cell" className={`text-sm ${late ? 'text-status-error' : 'text-content-secondary'}`}>
                {item.status === 'sent'
                  ? formatHandoffDay(item.sentAt)
                  : late
                    ? formatDaysLate(lateDays)
                    : formatHandoffDay(data.dueDate)}
              </span>
              <span role="cell" className={`${MONO} ${statusTone(item, late)}`}>
                {STATUS_WORD[item.status]}
              </span>
              <span role="cell" className="flex justify-end">
                {action ? (
                  <button type="button" onClick={action.run} disabled={isSaving} className={ROW_BUTTON}>
                    {action.label}
                  </button>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {leadOpen ? (
        <LeadTimePicker
          anchorRef={leadAnchor}
          current={data.leadDays}
          releaseDate={data.releaseDate}
          isSaving={isSaving}
          onClose={() => setLeadOpen(false)}
          onSave={async (leadDays) => {
            await onChange({ action: 'lead', leadDays });
            setLeadOpen(false);
          }}
        />
      ) : null}

      {ownerItem ? (
        <HandoffSheet
          label={`Who sends ${HANDOFF_ITEM_NOUNS[ownerItem.key]}?`}
          anchorRef={ownerAnchorRef}
          onClose={() => setOwnerFor(null)}
        >
          <SheetTitle>{`Who sends ${HANDOFF_ITEM_NOUNS[ownerItem.key]}?`}</SheetTitle>
          <p className="mb-2.5 mt-1.5 text-[13px] text-content-secondary">They get reminders 7 and 3 days before.</p>
          <ul>
            {data.members.map((member) => {
              const selected = member.userId === ownerItem.ownerUserId;
              return (
                <li key={member.userId} className="border-t border-stroke-default">
                  <button
                    type="button"
                    disabled={isSaving}
                    aria-pressed={selected}
                    onClick={async () => {
                      if (!selected) await onChange({ action: 'owner', item: ownerItem.key, ownerUserId: member.userId });
                      setOwnerFor(null);
                    }}
                    className="motion-focus flex h-[52px] w-full items-center gap-3 text-left text-[15px] text-content-primary hover:bg-bg-hover disabled:opacity-60"
                  >
                    <Face member={member} tone={toneById.get(member.userId)} size={22} />
                    <span className="min-w-0 flex-1 truncate">{member.name}</span>
                    {selected ? <SentMark size={18} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </HandoffSheet>
      ) : null}
    </section>
  );
}

function SheetTitle({ children }: { children: ReactNode }) {
  return <h4 className="font-display text-[22px] leading-tight text-content-primary">{children}</h4>;
}

function OwnerControl({
  item,
  owner,
  tone,
  caret = false,
  setAnchor,
  onOpen,
}: {
  item: HandoffItemView;
  owner: HandoffMember | null;
  tone?: string;
  caret?: boolean;
  setAnchor: (node: HTMLButtonElement | null) => void;
  onOpen: () => void;
}) {
  const name = owner?.name ?? 'Unassigned';
  const content = (
    <>
      <Face member={owner} tone={tone} />
      <span className="truncate text-content-primary">{name}</span>
      {caret && item.canAct && item.status !== 'sent' ? (
        <span aria-hidden="true" className="text-[10px] text-content-tertiary">
          ▾
        </span>
      ) : null}
    </>
  );
  if (!item.canAct || item.status === 'sent') {
    return <span className="flex min-w-0 items-center gap-2">{content}</span>;
  }
  return (
    <button
      ref={setAnchor}
      type="button"
      onClick={onOpen}
      aria-label={`Owner: ${name}. Change who sends ${HANDOFF_ITEM_NOUNS[item.key]}`}
      className="motion-focus flex min-w-0 items-center gap-2 hover:opacity-80"
    >
      {content}
    </button>
  );
}

function DueText({
  item,
  late,
  lateDays,
  dueDate,
}: {
  item: HandoffItemView;
  late: boolean;
  lateDays: number;
  dueDate: string | null;
}) {
  const text =
    item.status === 'sent'
      ? item.sentAt
        ? `Sent ${formatHandoffDay(item.sentAt)}`
        : 'Sent'
      : late
        ? formatDaysLate(lateDays)
        : dueDate
          ? `Due ${formatHandoffDay(dueDate)}`
          : null;
  if (!text) return null;
  return (
    <span className={`whitespace-nowrap ${late ? 'text-status-error' : 'text-content-secondary'}`}>
      <span aria-hidden="true">· </span>
      {text}
    </span>
  );
}

function LeadTimePicker({
  anchorRef,
  current,
  releaseDate,
  isSaving,
  onClose,
  onSave,
}: {
  anchorRef: RefObject<HTMLButtonElement | null>;
  current: HandoffLeadDays;
  releaseDate: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (leadDays: HandoffLeadDays) => Promise<void>;
}) {
  const [choice, setChoice] = useState<HandoffLeadDays>(current);
  const due = handoffDueDate(releaseDate, choice);
  return (
    <HandoffSheet label="Distributor lead time" anchorRef={anchorRef} onClose={onClose}>
      <SheetTitle>Distributor lead time</SheetTitle>
      <p className="mt-1.5 text-[13px] text-content-secondary">How early they need every file.</p>
      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Lead time">
        {HANDOFF_LEAD_CHOICES.map((days) => {
          const selected = days === choice;
          return (
            <button
              key={days}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(days)}
              className={`motion-focus inline-flex h-10 flex-1 items-center justify-center whitespace-nowrap border text-[13px] font-semibold transition-colors ${
                selected ? 'border-brand text-brand' : 'border-stroke-strong text-content-primary hover:bg-bg-hover'
              }`}
            >
              {`${days} days`}
            </button>
          );
        })}
      </div>
      {due ? <p className={`${MONO} mt-3.5 text-content-tertiary`}>{`Files due ${formatHandoffDay(due)}`}</p> : null}
      <button
        type="button"
        disabled={isSaving}
        onClick={() => void (choice === current ? Promise.resolve(onClose()) : onSave(choice))}
        className="motion-focus motion-press mt-[18px] inline-flex h-10 w-full items-center justify-center bg-brand text-[13px] font-semibold text-content-inverse transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    </HandoffSheet>
  );
}

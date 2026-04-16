import type {
  PlaybookStep,
  ReleasePlaybookPhase,
  ReleasePlaybookPhaseKey,
} from '@/lib/release-playbook';

type DraftStepState = {
  title: string;
  description: string;
  isSubmitting: boolean;
};

type ReleasePlaybookPhaseCardProps = {
  phase: ReleasePlaybookPhase;
  isEditMode: boolean;
  pendingStepId: string;
  editingStepId: string | null;
  editingTitle: string;
  editingDescription: string;
  draftStep: DraftStepState | null;
  draggedStepId: string | null;
  dragOverStepId: string | null;
  onToggle: (stepId: string, isCompleted: boolean) => void;
  onStartEditing: (step: PlaybookStep) => void;
  onChangeEditingTitle: (value: string) => void;
  onChangeEditingDescription: (value: string) => void;
  onCommitEditing: (step: PlaybookStep) => void;
  onCancelEditing: () => void;
  onDelete: (step: PlaybookStep) => void;
  onBeginAddStep: (phaseKey: ReleasePlaybookPhaseKey) => void;
  onChangeDraftTitle: (phaseKey: ReleasePlaybookPhaseKey, value: string) => void;
  onChangeDraftDescription: (phaseKey: ReleasePlaybookPhaseKey, value: string) => void;
  onSubmitDraft: (phaseKey: ReleasePlaybookPhaseKey, options?: { keepOpen?: boolean }) => void;
  onCancelDraft: (phaseKey: ReleasePlaybookPhaseKey) => void;
  onDragStartStep: (stepId: string) => void;
  onDragEndStep: () => void;
  onDragEnterStep: (stepId: string) => void;
  onDropStep: (phaseKey: ReleasePlaybookPhaseKey, targetStepId: string) => void;
};

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DragHandleIcon = () => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <circle cx="6" cy="5" r="1.5" />
    <circle cx="6" cy="10" r="1.5" />
    <circle cx="6" cy="15" r="1.5" />
    <circle cx="14" cy="5" r="1.5" />
    <circle cx="14" cy="10" r="1.5" />
    <circle cx="14" cy="15" r="1.5" />
  </svg>
);

function ReleasePlaybookReadRow({
  step,
  index,
  pendingStepId,
  onToggle,
}: {
  step: PlaybookStep;
  index: number;
  pendingStepId: string;
  onToggle: (stepId: string, isCompleted: boolean) => void;
}) {
  const isPending = pendingStepId === step.id;

  return (
    <button
      key={step.id}
      type="button"
      aria-pressed={step.isCompleted}
      disabled={isPending}
      onClick={() => onToggle(step.id, !step.isCompleted)}
      className={`flex min-h-[72px] w-full items-center gap-4 rounded-[22px] border px-4 py-4 text-left transition ${
        step.isCompleted
          ? 'border-brand/35 bg-brand/10'
          : 'border-stroke-subtle bg-bg-elevated/70 hover:border-stroke-default hover:bg-bg-hover'
      } ${isPending ? 'cursor-wait opacity-75' : ''}`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
          step.isCompleted
            ? 'border-brand bg-brand text-content-inverse'
            : 'border-stroke-default bg-bg-surface text-content-tertiary'
        }`}
      >
        {step.isCompleted ? <CheckIcon /> : <span className="text-sm font-semibold">{index + 1}</span>}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-content-primary">{step.title}</span>
        <span className="mt-1 block text-sm text-content-secondary">
          {step.description || (isPending ? 'Saving...' : step.isCompleted ? 'Completed' : 'Mark complete')}
        </span>
      </span>
    </button>
  );
}

function ReleasePlaybookDraftRow({
  phaseKey,
  draftStep,
  onChangeDraftTitle,
  onChangeDraftDescription,
  onSubmitDraft,
  onCancelDraft,
}: {
  phaseKey: ReleasePlaybookPhaseKey;
  draftStep: DraftStepState;
  onChangeDraftTitle: (phaseKey: ReleasePlaybookPhaseKey, value: string) => void;
  onChangeDraftDescription: (phaseKey: ReleasePlaybookPhaseKey, value: string) => void;
  onSubmitDraft: (phaseKey: ReleasePlaybookPhaseKey, options?: { keepOpen?: boolean }) => void;
  onCancelDraft: (phaseKey: ReleasePlaybookPhaseKey) => void;
}) {
  return (
    <div
      className="rounded-[22px] border border-dashed border-brand/35 bg-brand-muted/20 px-4 py-4"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
          return;
        }

        onSubmitDraft(phaseKey);
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-tertiary">
          <DragHandleIcon />
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            autoFocus
            value={draftStep.title}
            onChange={(event) => onChangeDraftTitle(phaseKey, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSubmitDraft(phaseKey, { keepOpen: true });
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                onCancelDraft(phaseKey);
              }
            }}
            placeholder="Step title"
            className="h-11 w-full rounded-[18px] border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary outline-none transition focus:border-brand"
          />
          <input
            value={draftStep.description}
            onChange={(event) => onChangeDraftDescription(phaseKey, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSubmitDraft(phaseKey, { keepOpen: true });
              }

              if (event.key === 'Escape') {
                event.preventDefault();
                onCancelDraft(phaseKey);
              }
            }}
            placeholder="Optional note or context"
            className="h-11 w-full rounded-[18px] border border-stroke-subtle bg-bg-elevated/80 px-4 text-sm text-content-secondary outline-none transition focus:border-brand"
          />
        </div>

        <button
          type="button"
          onClick={() => onCancelDraft(phaseKey)}
          className="rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-xs font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
        >
          Cancel
        </button>
      </div>

      {draftStep.isSubmitting ? (
        <p className="mt-3 text-xs uppercase tracking-[0.12em] text-content-tertiary">Saving step...</p>
      ) : null}
    </div>
  );
}

function ReleasePlaybookEditRow({
  step,
  index,
  isEditing,
  isPending,
  editingTitle,
  editingDescription,
  draggedStepId,
  dragOverStepId,
  onToggle,
  onStartEditing,
  onChangeEditingTitle,
  onChangeEditingDescription,
  onCommitEditing,
  onCancelEditing,
  onDelete,
  onDragStartStep,
  onDragEndStep,
  onDragEnterStep,
  onDropStep,
}: {
  step: PlaybookStep;
  index: number;
  isEditing: boolean;
  isPending: boolean;
  editingTitle: string;
  editingDescription: string;
  draggedStepId: string | null;
  dragOverStepId: string | null;
  onToggle: (stepId: string, isCompleted: boolean) => void;
  onStartEditing: (step: PlaybookStep) => void;
  onChangeEditingTitle: (value: string) => void;
  onChangeEditingDescription: (value: string) => void;
  onCommitEditing: (step: PlaybookStep) => void;
  onCancelEditing: () => void;
  onDelete: (step: PlaybookStep) => void;
  onDragStartStep: (stepId: string) => void;
  onDragEndStep: () => void;
  onDragEnterStep: (stepId: string) => void;
  onDropStep: (phaseKey: ReleasePlaybookPhaseKey, targetStepId: string) => void;
}) {
  const isDragged = draggedStepId === step.id;
  const isDragOver = dragOverStepId === step.id && draggedStepId !== step.id;

  return (
    <div
      draggable={!isPending && !isEditing}
      onDragStart={() => onDragStartStep(step.id)}
      onDragEnd={onDragEndStep}
      onDragOver={(event) => {
        event.preventDefault();
        onDragEnterStep(step.id);
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropStep(step.phaseKey, step.id);
      }}
      className={`rounded-[22px] border px-4 py-4 transition ${
        isPending
          ? 'border-brand/25 bg-brand/10 opacity-80'
          : 'border-stroke-subtle bg-bg-elevated/70 hover:border-stroke-default'
      } ${isDragged ? 'opacity-65' : ''} ${isDragOver ? 'border-brand/45 bg-brand-muted/25' : ''}`}
    >
      <div className="flex min-h-[76px] items-start gap-3">
        <span
          className="mt-1 inline-flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-tertiary"
          aria-label={`Drag to reorder ${step.title}`}
          title="Drag to reorder"
        >
          <DragHandleIcon />
        </span>

        <button
          type="button"
          aria-pressed={step.isCompleted}
          onClick={() => onToggle(step.id, !step.isCompleted)}
          className={`mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
            step.isCompleted
              ? 'border-brand bg-brand text-content-inverse'
              : 'border-stroke-default bg-bg-surface text-content-tertiary hover:border-brand hover:text-brand'
          }`}
        >
          {step.isCompleted ? <CheckIcon /> : <span className="text-sm font-semibold">{index + 1}</span>}
        </button>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div
              className="space-y-2"
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                  return;
                }

                onCommitEditing(step);
              }}
            >
              <input
                autoFocus
                value={editingTitle}
                onChange={(event) => onChangeEditingTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCommitEditing(step);
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    onCancelEditing();
                  }
                }}
                className="h-11 w-full rounded-[18px] border border-stroke-default bg-bg-surface px-4 text-sm font-semibold text-content-primary outline-none transition focus:border-brand"
              />
              <input
                value={editingDescription}
                onChange={(event) => onChangeEditingDescription(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCommitEditing(step);
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    onCancelEditing();
                  }
                }}
                placeholder="Optional note or context"
                className="h-11 w-full rounded-[18px] border border-stroke-subtle bg-bg-elevated/80 px-4 text-sm text-content-secondary outline-none transition focus:border-brand"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onStartEditing(step)}
              className="w-full rounded-[18px] px-1 py-1 text-left"
            >
              <span className="block truncate text-sm font-semibold text-content-primary">{step.title}</span>
              <span className="mt-1 block text-sm text-content-secondary">
                {step.description || (step.isCustom ? 'Custom step' : 'Default step')}
              </span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDelete(step)}
          className="rounded-full border border-status-error/20 bg-status-error/10 px-3 py-2 text-xs font-medium text-status-error hover:bg-status-error/15"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function ReleasePlaybookPhaseCard({
  phase,
  isEditMode,
  pendingStepId,
  editingStepId,
  editingTitle,
  editingDescription,
  draftStep,
  draggedStepId,
  dragOverStepId,
  onToggle,
  onStartEditing,
  onChangeEditingTitle,
  onChangeEditingDescription,
  onCommitEditing,
  onCancelEditing,
  onDelete,
  onBeginAddStep,
  onChangeDraftTitle,
  onChangeDraftDescription,
  onSubmitDraft,
  onCancelDraft,
  onDragStartStep,
  onDragEndStep,
  onDragEnterStep,
  onDropStep,
}: ReleasePlaybookPhaseCardProps) {
  return (
    <div
      className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-30px_rgba(0,0,0,0.4)] sm:p-6"
      data-ph-capture-attribute-section="playbook"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Phase</p>
          <h2 className="mt-2 text-2xl tracking-tight text-content-primary">{phase.title}</h2>
          <p className="mt-2 max-w-xl text-sm text-content-secondary">{phase.description}</p>
        </div>
        <span className="rounded-full border border-stroke-default bg-bg-elevated px-3 py-1 text-xs font-medium text-content-secondary">
          {phase.completedCount}/{phase.totalCount} complete
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {phase.items.map((step, index) =>
          isEditMode ? (
            <ReleasePlaybookEditRow
              key={step.id}
              step={step}
              index={index}
              isEditing={editingStepId === step.id}
              isPending={pendingStepId === step.id}
              editingTitle={editingTitle}
              editingDescription={editingDescription}
              draggedStepId={draggedStepId}
              dragOverStepId={dragOverStepId}
              onToggle={onToggle}
              onStartEditing={onStartEditing}
              onChangeEditingTitle={onChangeEditingTitle}
              onChangeEditingDescription={onChangeEditingDescription}
              onCommitEditing={onCommitEditing}
              onCancelEditing={onCancelEditing}
              onDelete={onDelete}
              onDragStartStep={onDragStartStep}
              onDragEndStep={onDragEndStep}
              onDragEnterStep={onDragEnterStep}
              onDropStep={onDropStep}
            />
          ) : (
            <ReleasePlaybookReadRow
              key={step.id}
              step={step}
              index={index}
              pendingStepId={pendingStepId}
              onToggle={onToggle}
            />
          )
        )}

        {isEditMode && draftStep ? (
          <ReleasePlaybookDraftRow
            phaseKey={phase.key}
            draftStep={draftStep}
            onChangeDraftTitle={onChangeDraftTitle}
            onChangeDraftDescription={onChangeDraftDescription}
            onSubmitDraft={onSubmitDraft}
            onCancelDraft={onCancelDraft}
          />
        ) : null}

        {isEditMode ? (
          <button
            type="button"
            onClick={() => onBeginAddStep(phase.key)}
            className="inline-flex min-h-11 items-center rounded-full border border-dashed border-stroke-default px-4 py-2 text-sm font-medium text-content-secondary transition hover:border-brand hover:text-brand"
          >
            Add Step
          </button>
        ) : null}

        {!isEditMode && phase.items.length === 0 ? (
          <p className="rounded-[22px] border border-dashed border-stroke-subtle px-4 py-5 text-sm text-content-secondary">
            No steps in this phase.
          </p>
        ) : null}
      </div>
    </div>
  );
}

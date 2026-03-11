'use client';

import { useEffect, useMemo, useState } from 'react';

type WorkspaceTab = 'overview' | 'tasks' | 'marketing' | 'playlist' | 'distribution' | 'assets';
type TaskBoardFilter = 'all' | 'ai' | 'custom' | 'release' | 'artist';

type TaskBoardItem = {
  id: string;
  title: string;
  description: string | null;
  status: 'current' | 'pending' | 'completed';
};

type CustomTaskItem = {
  id: string;
  title: string;
  description: string;
  status: 'current' | 'pending' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  tagScope: 'release' | 'artist';
  tagLabel: string;
};

type DistributionChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

type MarketingCalendarItem = {
  id: string;
  platform: string;
  contentType: string;
  captionIdea: string;
  publishDate: string;
  owner: string;
};

type PlaylistTrackerItem = {
  id: string;
  curator: string;
  platform: string;
  submissionDate: string;
  status: 'Not Submitted' | 'Submitted' | 'Accepted' | 'Rejected';
  notes: string;
};

type AssetItem = {
  id: string;
  name: string;
  category: string;
  ownerScope: 'release' | 'artist';
  url: string;
  path: string;
  size: number;
};

type WorkspaceSectionProps = {
  canEditWorkspace?: boolean;
  workspaceSyncMode: 'loading' | 'database' | 'local';
  workspaceSyncMessage: string;
  activeWorkspaceTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  taskBoardFilterStorageKey?: string;
  taskBoardItems: TaskBoardItem[];
  customTaskItems: CustomTaskItem[];
  newCustomTask: {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
    tagScope: 'release' | 'artist';
  };
  releaseTagLabel: string;
  artistTagLabel: string;
  onNewCustomTaskChange: (field: 'title' | 'description' | 'priority' | 'dueDate' | 'tagScope', value: string) => void;
  onAddCustomTask: () => void;
  onRemoveCustomTask: (id: string) => void;
  onCustomTaskStatusChange: (id: string, status: CustomTaskItem['status']) => void;
  onUpdateCustomTask: (id: string, updates: Partial<CustomTaskItem>) => void;
  onReorderCustomTask: (fromId: string, toId: string) => void;
  distributionItems: DistributionChecklistItem[];
  onToggleDistributionItem: (id: string) => void;
  marketingItems: MarketingCalendarItem[];
  newMarketing: {
    platform: string;
    contentType: string;
    captionIdea: string;
    publishDate: string;
    owner: string;
  };
  onNewMarketingChange: (field: 'platform' | 'contentType' | 'captionIdea' | 'publishDate' | 'owner', value: string) => void;
  onAddMarketing: () => void;
  onRemoveMarketing: (id: string) => void;
  onUpdateMarketing: (id: string, updates: Partial<MarketingCalendarItem>) => void;
  playlistItems: PlaylistTrackerItem[];
  newPlaylist: {
    curator: string;
    platform: string;
    submissionDate: string;
    notes: string;
  };
  onNewPlaylistChange: (field: 'curator' | 'platform' | 'submissionDate' | 'notes', value: string) => void;
  onAddPlaylist: () => void;
  onRemovePlaylist: (id: string) => void;
  onPlaylistStatusChange: (id: string, status: PlaylistTrackerItem['status']) => void;
  onUpdatePlaylist: (id: string, updates: Partial<PlaylistTrackerItem>) => void;
  assets: AssetItem[];
  isLoadingAssets: boolean;
  assetCategory: string;
  assetCategoryOptions: readonly string[];
  onAssetCategoryChange: (value: string) => void;
  assetOwnerScope: 'release' | 'artist';
  onAssetOwnerScopeChange: (value: 'release' | 'artist') => void;
  assetFileInputRef: React.RefObject<HTMLInputElement | null>;
  onAssetFileSelect: (file: File | null) => void;
  onUploadAsset: () => void;
  isUploadingAsset: boolean;
  onDeleteAsset: (path: string) => void;
  prettyAssetCategory: (category: string) => string;
};

export function WorkspaceSection({
  canEditWorkspace = true,
  workspaceSyncMode,
  workspaceSyncMessage,
  activeWorkspaceTab,
  onTabChange,
  taskBoardFilterStorageKey,
  taskBoardItems,
  customTaskItems,
  newCustomTask,
  releaseTagLabel,
  artistTagLabel,
  onNewCustomTaskChange,
  onAddCustomTask,
  onRemoveCustomTask,
  onCustomTaskStatusChange,
  onUpdateCustomTask,
  onReorderCustomTask,
  distributionItems,
  onToggleDistributionItem,
  marketingItems,
  newMarketing,
  onNewMarketingChange,
  onAddMarketing,
  onRemoveMarketing,
  onUpdateMarketing,
  playlistItems,
  newPlaylist,
  onNewPlaylistChange,
  onAddPlaylist,
  onRemovePlaylist,
  onPlaylistStatusChange,
  onUpdatePlaylist,
  assets,
  isLoadingAssets,
  assetCategory,
  assetCategoryOptions,
  onAssetCategoryChange,
  assetOwnerScope,
  onAssetOwnerScopeChange,
  assetFileInputRef,
  onAssetFileSelect,
  onUploadAsset,
  isUploadingAsset,
  onDeleteAsset,
  prettyAssetCategory,
}: WorkspaceSectionProps) {
  const [taskBoardFilter, setTaskBoardFilter] = useState<TaskBoardFilter>('all');
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropTargetTaskId, setDropTargetTaskId] = useState<string | null>(null);
  const [taskBoardSearch, setTaskBoardSearch] = useState('');
  const [editDraft, setEditDraft] = useState<{
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    dueDate: string;
  }>({
    title: '',
    description: '',
    priority: 'medium',
    dueDate: '',
  });
  const [editingMarketingId, setEditingMarketingId] = useState<string | null>(null);
  const [marketingEditDraft, setMarketingEditDraft] = useState({
    platform: '',
    contentType: '',
    captionIdea: '',
    publishDate: '',
    owner: '',
  });
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [playlistEditDraft, setPlaylistEditDraft] = useState({
    curator: '',
    platform: '',
    submissionDate: '',
    notes: '',
  });
  const allTaskCount = taskBoardItems.length + customTaskItems.length;
  const completedChecklistCount = distributionItems.filter((item) => item.done).length;
  const checklistPercent = distributionItems.length > 0 ? Math.round((completedChecklistCount / distributionItems.length) * 100) : 0;
  const filteredAiTasks = useMemo(() => {
    if (taskBoardFilter === 'all' || taskBoardFilter === 'ai') return taskBoardItems;
    return [];
  }, [taskBoardFilter, taskBoardItems]);
  const filteredCustomTasks = useMemo(() => {
    if (taskBoardFilter === 'all' || taskBoardFilter === 'custom') return customTaskItems;
    if (taskBoardFilter === 'release') return customTaskItems.filter((task) => task.tagScope === 'release');
    if (taskBoardFilter === 'artist') return customTaskItems.filter((task) => task.tagScope === 'artist');
    return [];
  }, [customTaskItems, taskBoardFilter]);
  const normalizedTaskSearch = taskBoardSearch.trim().toLowerCase();
  const visibleAiTasks = useMemo(() => {
    if (!normalizedTaskSearch) return filteredAiTasks;
    return filteredAiTasks.filter((task) => {
      return (
        task.title.toLowerCase().includes(normalizedTaskSearch) ||
        String(task.description || '')
          .toLowerCase()
          .includes(normalizedTaskSearch)
      );
    });
  }, [filteredAiTasks, normalizedTaskSearch]);
  const visibleCustomTasks = useMemo(() => {
    if (!normalizedTaskSearch) return filteredCustomTasks;
    return filteredCustomTasks.filter((task) => {
      return (
        task.title.toLowerCase().includes(normalizedTaskSearch) ||
        task.description.toLowerCase().includes(normalizedTaskSearch) ||
        task.tagLabel.toLowerCase().includes(normalizedTaskSearch)
      );
    });
  }, [filteredCustomTasks, normalizedTaskSearch]);
  const filteredTaskCount = visibleAiTasks.length + visibleCustomTasks.length;
  const hasTasksForExport = filteredAiTasks.length + filteredCustomTasks.length > 0;
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const syncClassName =
    workspaceSyncMode === 'database'
      ? 'border-brand/35 bg-brand-muted text-content-primary'
      : 'border-status-warning/35 bg-status-warning/10 text-status-warning';
  const panelCardClassName =
    'animate-in rounded-2xl border border-stroke-default bg-bg-elevated/90 p-4 sm:p-5 hover:-translate-y-[1px] transition';

  useEffect(() => {
    if (!taskBoardFilterStorageKey) return;
    const raw = localStorage.getItem(taskBoardFilterStorageKey);
    if (!raw) return;
    if (raw === 'all' || raw === 'ai' || raw === 'custom' || raw === 'release' || raw === 'artist') {
      setTaskBoardFilter(raw);
    }
  }, [taskBoardFilterStorageKey]);

  useEffect(() => {
    if (!taskBoardFilterStorageKey) return;
    localStorage.setItem(taskBoardFilterStorageKey, taskBoardFilter);
  }, [taskBoardFilter, taskBoardFilterStorageKey]);

  return (
    <section className="relative mt-8 overflow-hidden rounded-3xl border border-stroke-default bg-bg-surface p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-brand/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-status-info/15 blur-3xl" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[clamp(1.25rem,2.2vw,1.7rem)] font-semibold tracking-tight text-content-primary">
            Release Workspace
          </h2>
          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">
            Command center for execution modules
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${syncClassName}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
          {workspaceSyncMode === 'database' ? 'Synced to database' : 'Local draft mode'}
        </span>
      </div>
      {workspaceSyncMessage && (
        <p className="mt-2 text-xs text-content-secondary">{workspaceSyncMessage}</p>
      )}

      <div className="mt-5 rounded-2xl border border-stroke-default/80 bg-bg-elevated/70 p-2 backdrop-blur-sm">
        <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview', label: 'Overview', count: '' },
          { id: 'tasks', label: 'Task Board', count: String(allTaskCount) },
          { id: 'marketing', label: 'Marketing', count: String(marketingItems.length) },
          { id: 'playlist', label: 'Playlists', count: String(playlistItems.length) },
          { id: 'distribution', label: 'Checklist', count: `${checklistPercent}%` },
          { id: 'assets', label: 'Assets', count: String(assets.length) },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id as WorkspaceTab)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition inline-flex items-center gap-2 transform hover:-translate-y-[1px] ${
              activeWorkspaceTab === tab.id
                ? 'border-brand/50 bg-brand-muted text-content-primary shadow-[0_0_0_1px_rgba(255,255,255,0.05)]'
                : 'border-stroke-default bg-bg-elevated text-content-secondary hover:bg-bg-hover'
            }`}
          >
            {tab.label}
            {tab.count && (
              <span className="rounded-full bg-bg-overlay px-1.5 py-0.5 text-[10px]">{tab.count}</span>
            )}
          </button>
        ))}
        </div>
      </div>

      {activeWorkspaceTab === 'overview' && (
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
          <button
            type="button"
            onClick={() => onTabChange('tasks')}
            className="rounded-xl border border-stroke-default bg-bg-elevated p-3 text-left transition hover:-translate-y-[1px] hover:bg-bg-hover"
          >
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Tasks</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">{allTaskCount}</p>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('marketing')}
            className="rounded-xl border border-stroke-default bg-bg-elevated p-3 text-left transition hover:-translate-y-[1px] hover:bg-bg-hover"
          >
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Marketing Items</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">{marketingItems.length}</p>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('playlist')}
            className="rounded-xl border border-stroke-default bg-bg-elevated p-3 text-left transition hover:-translate-y-[1px] hover:bg-bg-hover"
          >
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Playlist Targets</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">{playlistItems.length}</p>
          </button>
          <button
            type="button"
            onClick={() => onTabChange('assets')}
            className="rounded-xl border border-stroke-default bg-bg-elevated p-3 text-left transition hover:-translate-y-[1px] hover:bg-bg-hover"
          >
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Assets</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-content-primary">{assets.length}</p>
          </button>
          <article className="rounded-lg border border-stroke-default bg-bg-elevated p-3 md:col-span-4">
            <p className="text-xs uppercase tracking-wide text-content-tertiary">Readiness Pulse</p>
            <p className="mt-1 text-sm text-content-secondary">
              Checklist completion: <span className="font-semibold text-content-primary">{checklistPercent}%</span>.
              Active modules: <span className="font-semibold text-content-primary">{['tasks', 'marketing', 'playlist', 'distribution', 'assets'].length}</span>.
            </p>
          </article>
        </div>
      )}

      <div key={activeWorkspaceTab} className="mt-6 grid grid-cols-1 gap-4 animate-in">
        <article className={`${activeWorkspaceTab !== 'tasks' ? 'hidden' : ''} ${panelCardClassName}`}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-content-tertiary">Task Board</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { id: 'all', label: 'All', count: allTaskCount },
              { id: 'ai', label: 'AI', count: taskBoardItems.length },
              { id: 'custom', label: 'Custom', count: customTaskItems.length },
              {
                id: 'release',
                label: 'Release-tagged',
                count: customTaskItems.filter((task) => task.tagScope === 'release').length,
              },
              {
                id: 'artist',
                label: 'Artist-tagged',
                count: customTaskItems.filter((task) => task.tagScope === 'artist').length,
              },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setTaskBoardFilter(filter.id as TaskBoardFilter)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  taskBoardFilter === filter.id
                    ? 'border-brand/45 bg-brand-muted text-content-primary'
                    : 'border-stroke-default bg-bg-surface text-content-secondary hover:bg-bg-hover'
                }`}
              >
                {filter.label} ({filter.count})
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={taskBoardSearch}
              onChange={(event) => setTaskBoardSearch(event.target.value)}
              placeholder="Search tasks"
              className="min-w-[220px] flex-1 rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={!hasTasksForExport}
              onClick={() => {
                const escapeCsv = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;
                const header = ['type', 'title', 'description', 'status', 'priority', 'due_date', 'tag_scope', 'tag_label'];
                const aiRows = visibleAiTasks.map((task) =>
                  [
                    'ai',
                    task.title,
                    task.description || '',
                    task.status,
                    '',
                    '',
                    'release',
                    releaseTagLabel,
                  ].map(escapeCsv)
                );
                const customRows = visibleCustomTasks.map((task) =>
                  [
                    'custom',
                    task.title,
                    task.description,
                    task.status,
                    task.priority,
                    task.dueDate,
                    task.tagScope,
                    task.tagLabel,
                  ].map(escapeCsv)
                );
                const csv = [header.join(','), ...aiRows.map((row) => row.join(',')), ...customRows.map((row) => row.join(','))].join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'task-board.csv';
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
              }}
              className="rounded-lg border border-stroke-default bg-bg-elevated px-2.5 py-2 text-xs text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Export CSV
            </button>
          </div>
          {allTaskCount === 0 ? (
            <div className="mt-3 rounded-lg border border-brand/25 bg-brand/5 px-3 py-3 text-sm text-content-secondary">
              <p>No tasks yet. Generate or add a next step to populate this board.</p>
              <p className="mt-1 text-xs text-content-tertiary">Tip: use the “Plan Next Step” action below the workspace.</p>
            </div>
          ) : filteredTaskCount === 0 ? (
            <div className="mt-3 rounded-lg border border-stroke-default bg-bg-surface px-3 py-3 text-sm text-content-secondary">
              No tasks match this filter yet.
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {visibleAiTasks.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-content-tertiary">AI Tasks</p>
                  <ul className="space-y-2">
                    {visibleAiTasks.map((task) => (
                      <li
                        key={task.id}
                        className={`rounded-lg border bg-bg-surface px-3 py-2 transition hover:-translate-y-[1px] ${
                          task.status === 'completed'
                            ? 'border-brand/35'
                            : task.status === 'current'
                              ? 'border-status-info/35'
                              : 'border-stroke-subtle'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium text-content-primary">{task.title}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              task.status === 'completed'
                                ? 'bg-brand-muted text-brand'
                                : task.status === 'current'
                                  ? 'bg-status-info/20 text-status-info'
                                  : 'bg-bg-overlay text-content-secondary'
                            }`}
                          >
                            {task.status}
                          </span>
                        </div>
                        {task.description && <p className="mt-1 text-xs text-content-secondary">{task.description}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {filteredCustomTasks.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-content-tertiary">Custom Tasks</p>
                  <p className="mb-2 text-xs text-content-tertiary">Drag and drop cards to reorder.</p>
                  <ul className="space-y-2">
                    {visibleCustomTasks.map((task) => (
                        <li
                          key={task.id}
                          draggable={canEditWorkspace && editingTaskId !== task.id}
                          onDragStart={() => {
                            if (!canEditWorkspace) return;
                            setDraggingTaskId(task.id);
                            setDropTargetTaskId(null);
                          }}
                          onDragOver={(event) => {
                            if (!canEditWorkspace) return;
                            event.preventDefault();
                            if (draggingTaskId && draggingTaskId !== task.id) {
                              setDropTargetTaskId(task.id);
                            }
                          }}
                          onDragLeave={() => {
                            if (!canEditWorkspace) return;
                            if (dropTargetTaskId === task.id) {
                              setDropTargetTaskId(null);
                            }
                          }}
                          onDrop={(event) => {
                            if (!canEditWorkspace) return;
                            event.preventDefault();
                            if (!draggingTaskId || draggingTaskId === task.id) return;
                            onReorderCustomTask(draggingTaskId, task.id);
                          setDraggingTaskId(null);
                          setDropTargetTaskId(null);
                        }}
                          onDragEnd={() => {
                            setDraggingTaskId(null);
                            setDropTargetTaskId(null);
                          }}
                        className={`rounded-lg border bg-bg-surface px-3 py-2 transition hover:-translate-y-[1px] ${
                          dropTargetTaskId === task.id
                            ? 'border-brand/70 ring-1 ring-brand/40'
                            : task.dueDate && task.dueDate < todayIso && task.status !== 'completed'
                              ? 'border-status-error/55 bg-status-error/5'
                              : 'border-brand/30'
                          } ${
                            !canEditWorkspace
                              ? 'cursor-default'
                              : editingTaskId === task.id
                                ? 'cursor-default'
                                : 'cursor-grab active:cursor-grabbing'
                          }`}
                        >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            {editingTaskId === task.id ? (
                              <input
                                value={editDraft.title}
                                onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))}
                                className="w-full rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-sm text-content-primary outline-none focus:border-brand"
                              />
                            ) : (
                              <p className="text-sm font-medium text-content-primary">{task.title}</p>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-status-info/35 bg-status-info/10 px-2 py-0.5 text-[11px] text-status-info">
                                {task.tagScope}: {task.tagLabel}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                  task.priority === 'high'
                                    ? 'border-status-error/40 bg-status-error/10 text-status-error'
                                    : task.priority === 'medium'
                                      ? 'border-status-warning/40 bg-status-warning/10 text-status-warning'
                                      : 'border-brand/35 bg-brand-muted text-brand'
                                }`}
                              >
                                {task.priority}
                              </span>
                              <span className="rounded-full border border-stroke-subtle bg-bg-elevated px-2 py-0.5 text-[11px] text-content-secondary">
                                {task.dueDate || 'No due date'}
                              </span>
                              {task.dueDate && task.dueDate < todayIso && task.status !== 'completed' && (
                                <span className="rounded-full border border-status-error/35 bg-status-error/10 px-2 py-0.5 text-[11px] text-status-error">
                                  overdue
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={task.status}
                              onChange={(event) => onCustomTaskStatusChange(task.id, event.target.value as CustomTaskItem['status'])}
                              disabled={!canEditWorkspace}
                              className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary"
                            >
                              <option value="pending">pending</option>
                              <option value="current">current</option>
                              <option value="completed">completed</option>
                            </select>
                            {canEditWorkspace && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (editingTaskId === task.id) {
                                      onUpdateCustomTask(task.id, {
                                        title: editDraft.title.trim() || task.title,
                                        description: editDraft.description,
                                        priority: editDraft.priority,
                                        dueDate: editDraft.dueDate,
                                      });
                                      setEditingTaskId(null);
                                      return;
                                    }
                                    setEditingTaskId(task.id);
                                    setEditDraft({
                                      title: task.title,
                                      description: task.description,
                                      priority: task.priority,
                                      dueDate: task.dueDate,
                                    });
                                  }}
                                  className="text-xs text-content-secondary hover:underline"
                                >
                                  {editingTaskId === task.id ? 'Save' : 'Edit'}
                                </button>
                                {editingTaskId === task.id && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingTaskId(null)}
                                    className="text-xs text-content-secondary hover:underline"
                                  >
                                    Cancel
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onRemoveCustomTask(task.id)}
                                  className="text-xs text-status-error hover:underline"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {(['pending', 'current', 'completed'] as const).map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => onCustomTaskStatusChange(task.id, status)}
                              disabled={!canEditWorkspace}
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                                task.status === status
                                  ? 'border-brand/40 bg-brand-muted text-content-primary'
                                  : 'border-stroke-subtle bg-bg-elevated text-content-secondary hover:bg-bg-hover'
                              }`}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                        {editingTaskId === task.id ? (
                          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                            <textarea
                              value={editDraft.description}
                              onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))}
                              placeholder="Description"
                              className="min-h-[68px] rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand md:col-span-2"
                            />
                            <div className="space-y-2">
                              <select
                                value={editDraft.priority}
                                onChange={(event) =>
                                  setEditDraft((current) => ({
                                    ...current,
                                    priority: (event.target.value as 'low' | 'medium' | 'high') || 'medium',
                                  }))
                                }
                                className="w-full rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                              >
                                <option value="low">low</option>
                                <option value="medium">medium</option>
                                <option value="high">high</option>
                              </select>
                              <input
                                type="date"
                                value={editDraft.dueDate}
                                onChange={(event) => setEditDraft((current) => ({ ...current, dueDate: event.target.value }))}
                                className="w-full rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                              />
                            </div>
                          </div>
                        ) : (
                          task.description && <p className="mt-1 text-xs text-content-secondary">{task.description}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {visibleCustomTasks.length === 0 && (
                    <p className="mt-2 text-xs text-content-tertiary">No custom tasks match your search.</p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="mt-4 rounded-xl border border-stroke-default bg-bg-surface p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">Create Custom Task</p>
            {canEditWorkspace ? (
              <>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-6">
                  <input
                    value={newCustomTask.title}
                    onChange={(event) => onNewCustomTaskChange('title', event.target.value)}
                    placeholder="Task title"
                    className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand md:col-span-2"
                  />
                  <select
                    value={newCustomTask.priority}
                    onChange={(event) => onNewCustomTaskChange('priority', event.target.value)}
                    className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                  >
                    <option value="low">Priority: low</option>
                    <option value="medium">Priority: medium</option>
                    <option value="high">Priority: high</option>
                  </select>
                  <input
                    type="date"
                    value={newCustomTask.dueDate}
                    onChange={(event) => onNewCustomTaskChange('dueDate', event.target.value)}
                    className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                  />
                  <select
                    value={newCustomTask.tagScope}
                    onChange={(event) => onNewCustomTaskChange('tagScope', event.target.value)}
                    className="rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                  >
                    <option value="release">Tag: release ({releaseTagLabel})</option>
                    <option value="artist">Tag: artist ({artistTagLabel})</option>
                  </select>
                  <button
                    type="button"
                    onClick={onAddCustomTask}
                    className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                  >
                    Create Custom Task
                  </button>
                </div>
                <textarea
                  value={newCustomTask.description}
                  onChange={(event) => onNewCustomTaskChange('description', event.target.value)}
                  placeholder="Optional description"
                  className="mt-2 min-h-[72px] w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                />
              </>
            ) : (
              <p className="mt-2 text-sm text-content-secondary">Workspace is read-only for your role.</p>
            )}
          </div>
        </article>

        <article className={`${activeWorkspaceTab !== 'distribution' ? 'hidden' : ''} ${panelCardClassName}`}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-content-tertiary">Distribution Checklist</h3>
          <div className="mt-3 space-y-2">
            {distributionItems.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-2 rounded-lg border bg-bg-surface px-3 py-2 text-sm text-content-secondary ${
                  item.done ? 'border-brand/35' : 'border-stroke-subtle'
                }`}
              >
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={!canEditWorkspace}
                  onChange={() => onToggleDistributionItem(item.id)}
                  className="mt-0.5 h-4 w-4"
                />
                <span className={item.done ? 'text-content-tertiary line-through' : 'text-content-primary'}>{item.label}</span>
              </label>
            ))}
          </div>
        </article>

        <article className={`${activeWorkspaceTab !== 'marketing' ? 'hidden' : ''} ${panelCardClassName}`}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-content-tertiary">Marketing Calendar</h3>
          {canEditWorkspace ? (
            <>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
                <input
                  value={newMarketing.platform}
                  onChange={(event) => onNewMarketingChange('platform', event.target.value)}
                  placeholder="Platform"
                  className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                />
                <input
                  value={newMarketing.contentType}
                  onChange={(event) => onNewMarketingChange('contentType', event.target.value)}
                  placeholder="Content type"
                  className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                />
                <input
                  type="date"
                  value={newMarketing.publishDate}
                  onChange={(event) => onNewMarketingChange('publishDate', event.target.value)}
                  className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                />
                <input
                  value={newMarketing.owner}
                  onChange={(event) => onNewMarketingChange('owner', event.target.value)}
                  placeholder="Owner"
                  className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={onAddMarketing}
                  className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  Add
                </button>
              </div>
              <textarea
                value={newMarketing.captionIdea}
                onChange={(event) => onNewMarketingChange('captionIdea', event.target.value)}
                placeholder="Caption idea (optional)"
                className="mt-2 min-h-[72px] w-full rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              />
            </>
          ) : (
            <p className="mt-3 text-sm text-content-secondary">Read-only access: you can view calendar entries.</p>
          )}
          {marketingItems.length > 0 ? (
            <div className="mt-3 space-y-2">
              {marketingItems.map((item) => (
                <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2">
                  <div>
                    {editingMarketingId === item.id ? (
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <input
                          value={marketingEditDraft.platform}
                          onChange={(event) => setMarketingEditDraft((current) => ({ ...current, platform: event.target.value }))}
                          className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                          placeholder="Platform"
                        />
                        <input
                          value={marketingEditDraft.contentType}
                          onChange={(event) => setMarketingEditDraft((current) => ({ ...current, contentType: event.target.value }))}
                          className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                          placeholder="Content type"
                        />
                        <input
                          type="date"
                          value={marketingEditDraft.publishDate}
                          onChange={(event) => setMarketingEditDraft((current) => ({ ...current, publishDate: event.target.value }))}
                          className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                        />
                        <input
                          value={marketingEditDraft.owner}
                          onChange={(event) => setMarketingEditDraft((current) => ({ ...current, owner: event.target.value }))}
                          className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                          placeholder="Owner"
                        />
                        <textarea
                          value={marketingEditDraft.captionIdea}
                          onChange={(event) => setMarketingEditDraft((current) => ({ ...current, captionIdea: event.target.value }))}
                          className="min-h-[68px] rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand md:col-span-2"
                          placeholder="Caption idea"
                        />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-content-primary">
                          {item.platform} • {item.contentType}
                        </p>
                        <p className="text-xs text-content-secondary">
                          {item.publishDate}
                          {item.owner ? ` • ${item.owner}` : ''}
                        </p>
                        {item.captionIdea && <p className="mt-1 text-xs text-content-secondary">{item.captionIdea}</p>}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {canEditWorkspace && editingMarketingId === item.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onUpdateMarketing(item.id, marketingEditDraft);
                            setEditingMarketingId(null);
                          }}
                          className="text-content-secondary hover:underline"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMarketingId(null)}
                          className="text-content-secondary hover:underline"
                        >
                          Cancel
                        </button>
                      </>
                    ) : canEditWorkspace ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMarketingId(item.id);
                          setMarketingEditDraft({
                            platform: item.platform,
                            contentType: item.contentType,
                            captionIdea: item.captionIdea,
                            publishDate: item.publishDate,
                            owner: item.owner,
                          });
                        }}
                        className="text-content-secondary hover:underline"
                      >
                        Edit
                      </button>
                    ) : null}
                    {canEditWorkspace && (
                      <button
                        type="button"
                        onClick={() => onRemoveMarketing(item.id)}
                        className="text-status-error hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-content-secondary">No calendar items yet.</p>
          )}
        </article>

        <article className={`${activeWorkspaceTab !== 'playlist' ? 'hidden' : ''} ${panelCardClassName}`}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-content-tertiary">Playlist Tracker</h3>
          {canEditWorkspace ? (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
              <input
                value={newPlaylist.curator}
                onChange={(event) => onNewPlaylistChange('curator', event.target.value)}
                placeholder="Curator / playlist"
                className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              />
              <input
                value={newPlaylist.platform}
                onChange={(event) => onNewPlaylistChange('platform', event.target.value)}
                placeholder="Platform"
                className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              />
              <input
                type="date"
                value={newPlaylist.submissionDate}
                onChange={(event) => onNewPlaylistChange('submissionDate', event.target.value)}
                className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              />
              <input
                value={newPlaylist.notes}
                onChange={(event) => onNewPlaylistChange('notes', event.target.value)}
                placeholder="Notes"
                className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={onAddPlaylist}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
              >
                Add
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-content-secondary">Read-only access: you can view tracker entries.</p>
          )}
          {playlistItems.length > 0 ? (
            <div className="mt-3 space-y-2">
              {playlistItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {editingPlaylistId === item.id ? (
                      <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2">
                        <input
                          value={playlistEditDraft.curator}
                          onChange={(event) => setPlaylistEditDraft((current) => ({ ...current, curator: event.target.value }))}
                          className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                          placeholder="Curator"
                        />
                        <input
                          value={playlistEditDraft.platform}
                          onChange={(event) => setPlaylistEditDraft((current) => ({ ...current, platform: event.target.value }))}
                          className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                          placeholder="Platform"
                        />
                        <input
                          type="date"
                          value={playlistEditDraft.submissionDate}
                          onChange={(event) => setPlaylistEditDraft((current) => ({ ...current, submissionDate: event.target.value }))}
                          className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                        />
                        <input
                          value={playlistEditDraft.notes}
                          onChange={(event) => setPlaylistEditDraft((current) => ({ ...current, notes: event.target.value }))}
                          className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary outline-none focus:border-brand"
                          placeholder="Notes"
                        />
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-content-primary">
                        {item.curator} • {item.platform}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <select
                        value={item.status}
                        onChange={(event) => onPlaylistStatusChange(item.id, event.target.value as PlaylistTrackerItem['status'])}
                        disabled={!canEditWorkspace}
                        className="rounded border border-stroke-subtle bg-bg-elevated px-2 py-1 text-xs text-content-primary"
                      >
                        <option>Not Submitted</option>
                        <option>Submitted</option>
                        <option>Accepted</option>
                        <option>Rejected</option>
                      </select>
                      {canEditWorkspace && editingPlaylistId === item.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onUpdatePlaylist(item.id, playlistEditDraft);
                              setEditingPlaylistId(null);
                            }}
                            className="text-xs text-content-secondary hover:underline"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingPlaylistId(null)}
                            className="text-xs text-content-secondary hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      ) : canEditWorkspace ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPlaylistId(item.id);
                            setPlaylistEditDraft({
                              curator: item.curator,
                              platform: item.platform,
                              submissionDate: item.submissionDate,
                              notes: item.notes,
                            });
                          }}
                          className="text-xs text-content-secondary hover:underline"
                        >
                          Edit
                        </button>
                      ) : null}
                      {canEditWorkspace && (
                        <button
                          type="button"
                          onClick={() => onRemovePlaylist(item.id)}
                          className="text-xs text-status-error hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  {editingPlaylistId !== item.id && (
                    <p className="text-xs text-content-secondary">
                      {item.submissionDate || 'No submission date'}
                      {item.notes ? ` • ${item.notes}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-content-secondary">No playlist submissions tracked yet.</p>
          )}
        </article>

        <article className={`${activeWorkspaceTab !== 'assets' ? 'hidden' : ''} ${panelCardClassName}`}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-content-tertiary">Asset Panel</h3>
            {isLoadingAssets && <span className="text-xs text-content-tertiary">Loading...</span>}
          </div>
          {canEditWorkspace ? (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
              <select
                value={assetCategory}
                onChange={(event) => onAssetCategoryChange(event.target.value)}
                className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              >
                {assetCategoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {prettyAssetCategory(category)}
                  </option>
                ))}
              </select>
              <select
                value={assetOwnerScope}
                onChange={(event) => onAssetOwnerScopeChange(event.target.value as 'release' | 'artist')}
                className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand"
              >
                <option value="release">Belongs to Release</option>
                <option value="artist">Belongs to Artist</option>
              </select>
              <input
                ref={assetFileInputRef}
                type="file"
                onChange={(event) => onAssetFileSelect(event.target.files?.[0] || null)}
                className="rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2 text-sm text-content-primary outline-none focus:border-brand md:col-span-2"
              />
              <button
                type="button"
                disabled={isUploadingAsset}
                onClick={onUploadAsset}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
              >
                {isUploadingAsset ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-content-secondary">Read-only access: you can open assets.</p>
          )}
          {assets.length > 0 ? (
            <div className="mt-3 space-y-2">
              {assets.map((asset) => (
                <div key={asset.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stroke-subtle bg-bg-surface px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-content-primary">{asset.name}</p>
                    <p className="text-xs text-content-secondary">
                      {prettyAssetCategory(asset.category)} • {asset.ownerScope} •{' '}
                      {asset.size > 0 ? `${Math.round(asset.size / 1024)} KB` : 'Size unknown'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline"
                    >
                      Open
                    </a>
                    {canEditWorkspace && (
                      <button
                        type="button"
                        onClick={() => onDeleteAsset(asset.path)}
                        className="text-status-error hover:underline"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-content-secondary">No assets uploaded yet.</p>
          )}
        </article>
      </div>
    </section>
  );
}

export type { WorkspaceTab };

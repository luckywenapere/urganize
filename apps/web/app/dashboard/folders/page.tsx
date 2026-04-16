'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@urganize/ui';
import { useRouter } from 'next/navigation';
import { PaywallGate } from '@/components/billing/PaywallGate';
import { SectionCard } from '@/components/shared/SectionCard';
import { SqlSetupNotice } from '@/components/shared/SqlSetupNotice';
import { Toast } from '@/components/shared/Toast';
import { FolderDashboardSkeleton } from '@/components/folders/FolderDashboardSkeleton';
import { useAuthStore } from '@/lib/auth-store';
import { supabase } from '@/lib/supabase/client';
import {
  FOLDER_COLOR_PRESETS,
  FOLDER_ICON_PRESETS,
  type CreateFolderBody,
  type Folder,
  type FolderApiError,
  type FolderListResponse,
  type FolderResponse,
} from '@/lib/folders';

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

function formatLastUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently updated';
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getFolderVisual(folder: Folder, index: number) {
  return {
    color: folder.color || FOLDER_COLOR_PRESETS[index % FOLDER_COLOR_PRESETS.length],
    icon: folder.icon || FOLDER_ICON_PRESETS[index % FOLDER_ICON_PRESETS.length],
  };
}

function buildFolderPayload(name: string, index: number): CreateFolderBody {
  return {
    name,
    color: FOLDER_COLOR_PRESETS[index % FOLDER_COLOR_PRESETS.length],
    icon: FOLDER_ICON_PRESETS[index % FOLDER_ICON_PRESETS.length],
  };
}

export default function FoldersDashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pageError, setPageError] = useState('');
  const [schemaSql, setSchemaSql] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isCreatingInline, setIsCreatingInline] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [busyFolderId, setBusyFolderId] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token || '';
    if (!accessToken) {
      throw new Error('Session expired. Please sign in again.');
    }

    return accessToken;
  }, []);

  const loadFolders = useCallback(async (showInitialLoading = false) => {
    if (!user) {
      return;
    }

    if (showInitialLoading) {
      setIsLoading(true);
    }

    setPageError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/folders', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        FolderListResponse & FolderApiError
      >;

      if (!response.ok) {
        if (response.status === 501 && payload.sql) {
          setSchemaSql(payload.sql);
          setFolders([]);
          return;
        }

        throw new Error(payload.error || 'Could not load folders.');
      }

      setSchemaSql('');
      setFolders(Array.isArray(payload.folders) ? payload.folders : []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not load folders.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [getAccessToken, user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user) {
      router.replace('/auth');
      return;
    }

    void loadFolders(!hasLoadedOnce);
  }, [authLoading, hasLoadedOnce, loadFolders, router, user]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!isCreatingInline) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      createInputRef.current?.focus();
    }, 30);

    return () => window.clearTimeout(timeoutId);
  }, [isCreatingInline]);

  useEffect(() => {
    if (!editingFolderId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 30);

    return () => window.clearTimeout(timeoutId);
  }, [editingFolderId]);

  useEffect(() => {
    if (!openMenuId) {
      return;
    }

    const handleWindowClick = () => {
      setOpenMenuId(null);
    };

    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [openMenuId]);

  const commitCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    setIsCreatingInline(false);
    setNewFolderName('');

    if (!name) {
      return;
    }

    setBusyFolderId('create');
    setPageError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(buildFolderPayload(name, folders.length)),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        FolderResponse & FolderApiError
      >;

      if (!response.ok) {
        if (response.status === 501 && payload.sql) {
          setSchemaSql(payload.sql);
          throw new Error('Folders tables still need to be set up.');
        }

        throw new Error(payload.error || 'Could not create folder.');
      }

      if (payload.folder) {
        setFolders((current) => [payload.folder as Folder, ...current]);
      }
      setToast({ message: 'Folder created.', tone: 'success' });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not create folder.');
    } finally {
      setBusyFolderId(null);
    }
  }, [folders.length, getAccessToken, newFolderName]);

  const commitRenameFolder = useCallback(async () => {
    const folderId = editingFolderId;
    const nextName = editingFolderName.trim();
    const currentFolder = folders.find((folder) => folder.id === folderId) || null;

    setEditingFolderId(null);
    setEditingFolderName('');

    if (!folderId || !currentFolder || !nextName || nextName === currentFolder.name) {
      return;
    }

    setBusyFolderId(folderId);
    setPageError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/folders/${folderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: nextName,
          color: currentFolder.color,
          icon: currentFolder.icon,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        FolderResponse & FolderApiError
      >;

      if (!response.ok) {
        throw new Error(payload.error || 'Could not rename folder.');
      }

      if (payload.folder) {
        setFolders((current) =>
          current.map((folder) => (folder.id === folderId ? (payload.folder as Folder) : folder))
        );
      }
      setToast({ message: 'Folder renamed.', tone: 'success' });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not rename folder.');
    } finally {
      setBusyFolderId(null);
    }
  }, [editingFolderId, editingFolderName, folders, getAccessToken]);

  const handleDeleteFolder = async (folder: Folder) => {
    setOpenMenuId(null);
    if (!window.confirm(`Delete "${folder.name}" and all of its items?`)) {
      return;
    }

    setBusyFolderId(folder.id);
    setPageError('');

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<FolderApiError>;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not delete folder.');
      }

      setFolders((current) => current.filter((item) => item.id !== folder.id));
      setToast({ message: 'Folder deleted.', tone: 'success' });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not delete folder.');
    } finally {
      setBusyFolderId(null);
    }
  };

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return <FolderDashboardSkeleton />;
  }

  if (!user) {
    return <FolderDashboardSkeleton />;
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
        <div className="panel-shell p-5 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-content-tertiary">
            Folders
          </p>
          <h1 className="mt-4 text-4xl text-content-primary sm:text-5xl">
            Organize release ops
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-content-secondary sm:text-base">
            Keep contracts, links, files, and notes together.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <div className="inline-flex min-h-11 items-center rounded-full border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary">
              {folders.length} folder{folders.length === 1 ? '' : 's'}
            </div>
            <div className="inline-flex min-h-11 items-center rounded-full border border-brand/20 bg-brand-muted px-4 text-sm font-semibold text-content-primary">
              {folders.reduce((sum, folder) => sum + folder.itemCount, 0)} item
              {folders.reduce((sum, folder) => sum + folder.itemCount, 0) === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {toast ? <Toast message={toast.message} tone={toast.tone} /> : null}

          {pageError ? (
            <p className="rounded-[24px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
              {pageError}
            </p>
          ) : null}

          {schemaSql ? (
            <SqlSetupNotice
              title="Folders tables still need to be created"
              description="Run this SQL once in Supabase, then refresh the dashboard to start organizing your files and records."
              sql={schemaSql}
            />
          ) : null}
        </div>

        <SectionCard
          className="mt-5 rounded-[32px] p-4 sm:p-6"
          data-ph-capture-attribute-section="folders"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl text-content-primary">Folders</h2>
              <p className="mt-2 text-sm text-content-secondary">
                Keep scattered links, files, and notes together.
              </p>
            </div>

            <PaywallGate>
              {({ requireAccess }) => (
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    void requireAccess(() => {
                      setIsCreatingInline(true);
                      setOpenMenuId(null);
                    });
                  }}
                  isLoading={busyFolderId === 'create'}
                >
                  New folder
                </Button>
              )}
            </PaywallGate>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PaywallGate>
              {({ requireAccess }) =>
                isCreatingInline ? (
                  <div className="panel-shell-subtle border-brand/30 bg-brand-muted/60 p-5">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-brand/20 bg-bg-surface text-2xl">
                      +
                    </div>
                    <label className="mt-5 block">
                      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                        Folder name
                      </span>
                      <input
                        ref={createInputRef}
                        value={newFolderName}
                        onChange={(event) => setNewFolderName(event.target.value)}
                        onBlur={() => void requireAccess(() => commitCreateFolder())}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void requireAccess(() => commitCreateFolder());
                          }

                          if (event.key === 'Escape') {
                            setIsCreatingInline(false);
                            setNewFolderName('');
                          }
                        }}
                        placeholder="A&R Contacts"
                        className="input h-12 rounded-[18px]"
                      />
                    </label>
                    <p className="mt-3 text-sm text-content-secondary">
                      Press Enter to save.
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void requireAccess(() => setIsCreatingInline(true))}
                    className="group rounded-[30px] border border-dashed border-stroke-default bg-bg-elevated/70 p-5 text-left transition hover:-translate-y-[1px] hover:border-brand/30 hover:bg-brand-muted/40"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-stroke-default bg-bg-surface text-3xl text-content-secondary transition group-hover:text-content-primary">
                      +
                    </div>
                    <p className="mt-5 text-lg font-semibold text-content-primary">New folder</p>
                    <p className="mt-2 text-sm leading-6 text-content-secondary">
                      Add a folder.
                    </p>
                  </button>
                )
              }
            </PaywallGate>

            {folders.map((folder, index) => {
              const visual = getFolderVisual(folder, index);
              const isBusy = busyFolderId === folder.id;
              const isEditing = editingFolderId === folder.id;

              return (
                <article
                  key={folder.id}
                  className="group relative overflow-hidden rounded-[30px] border border-stroke-subtle bg-bg-elevated/80 p-5 shadow-[0_16px_40px_-28px_rgba(0,0,0,0.5)] transition hover:-translate-y-[1px] hover:border-stroke-default hover:bg-bg-hover"
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 top-0 h-24 opacity-20"
                    style={{
                      background: `radial-gradient(circle at top, ${visual.color}, transparent 72%)`,
                    }}
                  />

                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (!isEditing) {
                            router.push(`/dashboard/folders/${folder.id}`);
                          }
                        }}
                        className="flex min-w-0 flex-1 items-start gap-4 text-left"
                      >
                        <div
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-stroke-default/70 text-2xl"
                          style={{ backgroundColor: `${visual.color}22` }}
                        >
                          {visual.icon}
                        </div>

                        <div className="min-w-0 flex-1">
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              value={editingFolderName}
                              onChange={(event) => setEditingFolderName(event.target.value)}
                              onBlur={() => void commitRenameFolder()}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void commitRenameFolder();
                                }

                                if (event.key === 'Escape') {
                                  setEditingFolderId(null);
                                  setEditingFolderName('');
                                }
                              }}
                              className="w-full rounded-[14px] border border-stroke-default bg-bg-surface px-3 py-2 text-lg font-semibold text-content-primary outline-none focus:border-brand"
                            />
                          ) : (
                            <h3 className="truncate text-2xl text-content-primary">{folder.name}</h3>
                          )}
                          <p className="mt-2 text-sm text-content-secondary">
                            Updated {formatLastUpdated(folder.lastUpdatedAt)}
                          </p>
                        </div>
                      </button>

                      <div className="relative">
                        <button
                          type="button"
                          disabled={isBusy}
                          aria-label={`Open actions for ${folder.name}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === folder.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId((current) => (current === folder.id ? null : folder.id));
                          }}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
                        >
                          <span aria-hidden="true" className="text-lg leading-none">⋯</span>
                        </button>

                        {openMenuId === folder.id ? (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            className="menu-shell absolute right-0 top-[calc(100%+0.5rem)] z-20 min-w-[180px] p-2"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setEditingFolderId(folder.id);
                                setEditingFolderName(folder.name);
                              }}
                              className="block w-full rounded-[12px] px-3 py-2 text-left text-sm text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
                            >
                              Rename folder
                            </button>
                            <Link
                              href={`/dashboard/folders/${folder.id}`}
                              className="mt-1 block rounded-[12px] px-3 py-2 text-sm text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
                            >
                              Open folder
                            </Link>
                            <button
                              type="button"
                              onClick={() => void handleDeleteFolder(folder)}
                              className="mt-1 block w-full rounded-[12px] px-3 py-2 text-left text-sm text-status-error transition hover:bg-status-error/10"
                            >
                              Delete folder
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                      <span className="rounded-full border border-stroke-default bg-bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-content-secondary">
                        {folder.itemCount} item{folder.itemCount === 1 ? '' : 's'}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => router.push(`/dashboard/folders/${folder.id}`)}
                      className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-brand/20 bg-brand px-4 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-65"
                    >
                      {isBusy ? 'Working...' : 'Open folder'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@urganize/ui';
import { SectionCard } from '@/components/shared/SectionCard';
import { SqlSetupNotice } from '@/components/shared/SqlSetupNotice';
import { Toast } from '@/components/shared/Toast';
import { FolderDetailSkeleton } from '@/components/folders/FolderDetailSkeleton';
import { FolderItemCard } from '@/components/folders/FolderItemCard';
import { ReleaseCombobox } from '@/components/pre-save/ReleaseCombobox';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics';
import {
  CONTRACT_TYPES,
  FOLDER_COLOR_PRESETS,
  FOLDER_ICON_PRESETS,
  FOLDER_ITEM_TYPES,
  FOLDER_STORAGE_BUCKET,
  formatContractTypeLabel,
  formatFolderItemTypeLabel,
  type ContractType,
  type CreateFolderItemBody,
  type Folder,
  type FolderApiError,
  type FolderItem,
  type FolderItemResponse,
  type FolderItemType,
  type FolderItemsResponse,
  type FolderListResponse,
  type FolderResponse,
} from '@/lib/folders';
import {
  formatReleaseDate,
  slugifySegment,
  type PreSaveReleaseOption,
  type ReleaseSelectorListResponse,
} from '@/lib/pre-save';
import { supabase } from '@/lib/supabase/client';

type FolderDetailClientPageProps = {
  folderId: string;
};

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

type FolderFilter = 'all' | FolderItemType;

type FolderItemFormState = {
  type: FolderItemType;
  title: string;
  content: string;
  url: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  counterpartyName: string;
  signedDate: string;
  contractType: ContractType;
  selectedRelease: PreSaveReleaseOption | null;
  releaseQuery: string;
  file: File | null;
  existingFileUrl: string;
  existingStoragePath: string;
  existingFileName: string;
  existingFileSize: number;
  existingMimeType: string;
};

type InlineReleaseCreateResponse = {
  release?: PreSaveReleaseOption;
  error?: string;
  sql?: string;
};

type UploadedFilePayload = {
  publicUrl: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

function buildEmptyFormState(type: FolderItemType = 'note'): FolderItemFormState {
  return {
    type,
    title: '',
    content: '',
    url: '',
    contactRole: '',
    contactEmail: '',
    contactPhone: '',
    counterpartyName: '',
    signedDate: '',
    contractType: 'distribution',
    selectedRelease: null,
    releaseQuery: '',
    file: null,
    existingFileUrl: '',
    existingStoragePath: '',
    existingFileName: '',
    existingFileSize: 0,
    existingMimeType: '',
  };
}

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

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return 'Unknown size';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeMatchValue(value: string): string {
  return value.trim().toLowerCase();
}

function getFolderVisual(folder: Folder | null, folders: Folder[]) {
  if (!folder) {
    return {
      color: FOLDER_COLOR_PRESETS[0],
      icon: FOLDER_ICON_PRESETS[0],
    };
  }

  const index = Math.max(
    folders.findIndex((entry) => entry.id === folder.id),
    0
  );

  return {
    color: folder.color || FOLDER_COLOR_PRESETS[index % FOLDER_COLOR_PRESETS.length],
    icon: folder.icon || FOLDER_ICON_PRESETS[index % FOLDER_ICON_PRESETS.length],
  };
}

function buildFormStateFromItem(item: FolderItem): FolderItemFormState {
  switch (item.type) {
    case 'note':
      return {
        ...buildEmptyFormState('note'),
        title: item.title,
        content: item.content || '',
      };
    case 'link':
      return {
        ...buildEmptyFormState('link'),
        title: item.title,
        content: item.content || '',
        url: item.url || '',
      };
    case 'file':
      return {
        ...buildEmptyFormState('file'),
        title: item.title,
        content: item.content || '',
        existingFileUrl: item.url || '',
        existingStoragePath: item.metadata.storagePath,
        existingFileName: item.metadata.fileName,
        existingFileSize: item.metadata.fileSize,
        existingMimeType: item.metadata.mimeType,
      };
    case 'contact':
      return {
        ...buildEmptyFormState('contact'),
        title: item.title,
        content: item.content || '',
        contactRole: item.metadata.role || '',
        contactEmail: item.metadata.email || '',
        contactPhone: item.metadata.phone || '',
      };
    case 'release':
      return {
        ...buildEmptyFormState('release'),
        title: item.title,
        selectedRelease: item.linkedRelease,
        releaseQuery: item.linkedRelease?.title || item.title,
      };
    case 'contract':
      return {
        ...buildEmptyFormState('contract'),
        title: item.title,
        existingFileUrl: item.url || '',
        existingStoragePath: item.metadata.storagePath,
        existingFileName: item.metadata.fileName,
        existingFileSize: item.metadata.fileSize,
        existingMimeType: item.metadata.mimeType,
        counterpartyName: item.metadata.counterpartyName || '',
        signedDate: item.metadata.signedDate || '',
        contractType: item.metadata.contractType || 'other',
      };
    default:
      return buildEmptyFormState('note');
  }
}

function buildStoragePath(
  userId: string,
  folderId: string,
  itemType: 'file' | 'contract',
  fileName: string
): string {
  const extension = fileName.includes('.') ? fileName.split('.').pop() || '' : '';
  const cleanedExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseName = fileName.replace(/\.[^.]+$/, '');
  const slugBase = slugifySegment(baseName) || itemType;

  return [
    userId,
    'folders',
    folderId,
    itemType,
    `${Date.now()}-${slugBase}${cleanedExtension ? `.${cleanedExtension}` : ''}`,
  ].join('/');
}

async function parseApiPayload<T>(response: Response): Promise<Partial<T & FolderApiError>> {
  return (await response.json().catch(() => ({}))) as Partial<T & FolderApiError>;
}

export function FolderDetailClientPage({ folderId }: FolderDetailClientPageProps) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<FolderItem[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<FolderFilter>('all');
  const [releases, setReleases] = useState<PreSaveReleaseOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [pageError, setPageError] = useState('');
  const [schemaSql, setSchemaSql] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FolderItem | null>(null);
  const [itemFormState, setItemFormState] = useState<FolderItemFormState>(() => buildEmptyFormState());
  const [modalError, setModalError] = useState('');
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [hasLoadedReleases, setHasLoadedReleases] = useState(false);
  const [isCreatingInlineRelease, setIsCreatingInlineRelease] = useState(false);
  const [openItemMenuId, setOpenItemMenuId] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const modalTitleInputRef = useRef<HTMLInputElement | null>(null);
  const inlineReleasePromiseRef = useRef<Promise<PreSaveReleaseOption | null> | null>(null);

  const filteredItems = useMemo(() => {
    if (selectedFilter === 'all') {
      return items;
    }

    return items.filter((item) => item.type === selectedFilter);
  }, [items, selectedFilter]);

  const folderVisual = useMemo(() => getFolderVisual(folder, folders), [folder, folders]);
  const filterCounts = useMemo(() => {
    const counts = new Map<FolderItemType, number>();
    for (const type of FOLDER_ITEM_TYPES) {
      counts.set(type, 0);
    }

    for (const item of items) {
      counts.set(item.type, (counts.get(item.type) || 0) + 1);
    }

    return counts;
  }, [items]);

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

  const loadFolderData = useCallback(
    async (showInitialLoading = false) => {
      if (!user) {
        return;
      }

      if (showInitialLoading) {
        setIsLoading(true);
      }

      setPageError('');

      try {
        const accessToken = await getAccessToken();
        const headers = {
          Authorization: `Bearer ${accessToken}`,
        };

        const [folderResponse, foldersResponse, itemsResponse] = await Promise.all([
          fetch(`/api/folders/${folderId}`, {
            method: 'GET',
            headers,
            cache: 'no-store',
          }),
          fetch('/api/folders', {
            method: 'GET',
            headers,
            cache: 'no-store',
          }),
          fetch(`/api/folders/${folderId}/items`, {
            method: 'GET',
            headers,
            cache: 'no-store',
          }),
        ]);

        const [folderPayload, foldersPayload, itemsPayload] = await Promise.all([
          parseApiPayload<FolderResponse>(folderResponse),
          parseApiPayload<FolderListResponse>(foldersResponse),
          parseApiPayload<FolderItemsResponse>(itemsResponse),
        ]);

        if (folderResponse.status === 404) {
          setNotFound(true);
          setFolder(null);
          setItems([]);
          setSchemaSql('');
          return;
        }

        const missingSchemaPayload =
          (folderResponse.status === 501 && folderPayload.sql
            ? folderPayload
            : foldersResponse.status === 501 && foldersPayload.sql
              ? foldersPayload
              : itemsResponse.status === 501 && itemsPayload.sql
                ? itemsPayload
                : null) || null;

        if (missingSchemaPayload?.sql) {
          setSchemaSql(missingSchemaPayload.sql);
          setFolder(null);
          setFolders([]);
          setItems([]);
          setNotFound(false);
          return;
        }

        if (!folderResponse.ok) {
          throw new Error(folderPayload.error || 'Could not load folder.');
        }

        if (!foldersResponse.ok) {
          throw new Error(foldersPayload.error || 'Could not load folders.');
        }

        if (!itemsResponse.ok) {
          throw new Error(itemsPayload.error || 'Could not load folder items.');
        }

        setFolder(folderPayload.folder || null);
        setFolders(Array.isArray(foldersPayload.folders) ? foldersPayload.folders : []);
        setItems(Array.isArray(itemsPayload.items) ? itemsPayload.items : []);
        setSchemaSql('');
        setNotFound(false);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : 'Could not load folder.');
      } finally {
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    },
    [folderId, getAccessToken, user]
  );

  const loadReleases = useCallback(async () => {
    if (!user) {
      return;
    }

    setIsLoadingReleases(true);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch('/api/releases?view=selector', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as Partial<
        ReleaseSelectorListResponse & FolderApiError
      >;

      if (!response.ok) {
        throw new Error(payload.error || 'Could not load releases.');
      }

      setReleases(Array.isArray(payload.releases) ? payload.releases : []);
      setHasLoadedReleases(true);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : 'Could not load releases.');
    } finally {
      setIsLoadingReleases(false);
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

    void loadFolderData(!hasLoadedOnce);
  }, [authLoading, hasLoadedOnce, loadFolderData, router, user]);

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
    if (!openItemMenuId) {
      return;
    }

    const handleWindowClick = () => {
      setOpenItemMenuId(null);
    };

    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [openItemMenuId]);

  useEffect(() => {
    if (!isItemModalOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      modalTitleInputRef.current?.focus();
    }, 40);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmittingItem) {
        setIsItemModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isItemModalOpen, isSubmittingItem]);

  const openCreateItemModal = useCallback(
    (type: FolderItemType = 'note') => {
      setEditingItem(null);
      setItemFormState(buildEmptyFormState(type));
      setModalError('');
      setOpenItemMenuId(null);
      setIsItemModalOpen(true);

      if (type === 'release' && !hasLoadedReleases) {
        void loadReleases();
      }
    },
    [hasLoadedReleases, loadReleases]
  );

  const openEditItemModal = useCallback(
    (item: FolderItem) => {
      setEditingItem(item);
      setItemFormState(buildFormStateFromItem(item));
      setModalError('');
      setOpenItemMenuId(null);
      setIsItemModalOpen(true);

      if (item.type === 'release' && !hasLoadedReleases) {
        void loadReleases();
      }
    },
    [hasLoadedReleases, loadReleases]
  );

  const upsertReleaseOption = useCallback((release: PreSaveReleaseOption) => {
    setReleases((current) => [release, ...current.filter((entry) => entry.id !== release.id)]);
  }, []);

  const createInlineRelease = useCallback(
    async (title: string): Promise<PreSaveReleaseOption | null> => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        return null;
      }

      if (inlineReleasePromiseRef.current) {
        return inlineReleasePromiseRef.current;
      }

      const createPromise = (async () => {
        setIsCreatingInlineRelease(true);
        setModalError('');

        try {
          const accessToken = await getAccessToken();
          const response = await fetch('/api/releases', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              title: trimmedTitle,
              source: 'dashboard',
            }),
          });

          const payload = (await response.json().catch(() => ({}))) as InlineReleaseCreateResponse;

          if (!response.ok || !payload.release) {
            throw new Error(payload.error || 'Could not create release.');
          }

          upsertReleaseOption(payload.release);
          setItemFormState((current) => ({
            ...current,
            selectedRelease: payload.release || null,
            releaseQuery: payload.release?.title || trimmedTitle,
          }));
          return payload.release;
        } catch (error) {
          setModalError(error instanceof Error ? error.message : 'Could not create release.');
          return null;
        } finally {
          setIsCreatingInlineRelease(false);
          inlineReleasePromiseRef.current = null;
        }
      })();

      inlineReleasePromiseRef.current = createPromise;
      return createPromise;
    },
    [getAccessToken, upsertReleaseOption]
  );

  const ensureReleaseSelected = useCallback(async (): Promise<PreSaveReleaseOption | null> => {
    if (itemFormState.type !== 'release') {
      return null;
    }

    const normalizedQuery = normalizeMatchValue(itemFormState.releaseQuery);
    if (!normalizedQuery) {
      return null;
    }

    if (
      itemFormState.selectedRelease &&
      normalizeMatchValue(itemFormState.selectedRelease.title) === normalizedQuery
    ) {
      return itemFormState.selectedRelease;
    }

    const matchedRelease =
      releases.find((release) => normalizeMatchValue(release.title) === normalizedQuery) || null;

    if (matchedRelease) {
      setItemFormState((current) => ({
        ...current,
        selectedRelease: matchedRelease,
        releaseQuery: matchedRelease.title,
      }));
      return matchedRelease;
    }

    return createInlineRelease(itemFormState.releaseQuery);
  }, [createInlineRelease, itemFormState.releaseQuery, itemFormState.selectedRelease, itemFormState.type, releases]);

  const uploadFolderFile = useCallback(
    async (file: File, itemType: 'file' | 'contract'): Promise<UploadedFilePayload> => {
      if (!user) {
        throw new Error('Session expired. Please sign in again.');
      }

      const storagePath = buildStoragePath(user.id, folderId, itemType, file.name);
      const uploadResult = await supabase.storage.from(FOLDER_STORAGE_BUCKET).upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || undefined,
      });

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message || 'Could not upload file.');
      }

      const { data } = supabase.storage.from(FOLDER_STORAGE_BUCKET).getPublicUrl(storagePath);

      return {
        publicUrl: data.publicUrl,
        storagePath,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || '',
      };
    },
    [folderId, user]
  );

  const buildItemPayload = useCallback(async (): Promise<{
    payload: CreateFolderItemBody;
    uploadedStoragePath: string | null;
  }> => {
    const trimmedTitle = itemFormState.title.trim();
    const trimmedContent = itemFormState.content.trim();
    let url = itemFormState.url.trim() || null;
    let metadata: Record<string, unknown> | null = null;
    let title = trimmedTitle;
    let uploadedStoragePath: string | null = null;

    switch (itemFormState.type) {
      case 'note':
        break;
      case 'link':
        break;
      case 'file': {
        if (itemFormState.file) {
          const upload = await uploadFolderFile(itemFormState.file, 'file');
          url = upload.publicUrl;
          uploadedStoragePath = upload.storagePath;
          metadata = {
            storagePath: upload.storagePath,
            fileName: upload.fileName,
            fileSize: upload.fileSize,
            mimeType: upload.mimeType,
          };
        } else {
          url = itemFormState.existingFileUrl || null;
          metadata = {
            storagePath: itemFormState.existingStoragePath,
            fileName: itemFormState.existingFileName,
            fileSize: itemFormState.existingFileSize,
            mimeType: itemFormState.existingMimeType,
          };
        }
        break;
      }
      case 'contact':
        metadata = {
          role: itemFormState.contactRole.trim() || null,
          email: itemFormState.contactEmail.trim().toLowerCase() || null,
          phone: itemFormState.contactPhone.trim() || null,
        };
        break;
      case 'release': {
        const selectedRelease = await ensureReleaseSelected();
        if (!selectedRelease) {
          throw new Error('Select a release before saving.');
        }

        title = selectedRelease.title;
        metadata = {
          releaseId: selectedRelease.id,
        };
        break;
      }
      case 'contract': {
        if (itemFormState.file) {
          const upload = await uploadFolderFile(itemFormState.file, 'contract');
          url = upload.publicUrl;
          uploadedStoragePath = upload.storagePath;
          metadata = {
            storagePath: upload.storagePath,
            fileName: upload.fileName,
            fileSize: upload.fileSize,
            mimeType: upload.mimeType,
            counterpartyName: itemFormState.counterpartyName.trim() || null,
            signedDate: itemFormState.signedDate.trim() || null,
            contractType: itemFormState.contractType,
          };
        } else {
          url = itemFormState.existingFileUrl || null;
          metadata = {
            storagePath: itemFormState.existingStoragePath,
            fileName: itemFormState.existingFileName,
            fileSize: itemFormState.existingFileSize,
            mimeType: itemFormState.existingMimeType,
            counterpartyName: itemFormState.counterpartyName.trim() || null,
            signedDate: itemFormState.signedDate.trim() || null,
            contractType: itemFormState.contractType,
          };
        }
        break;
      }
      default:
        break;
    }

    return {
      payload: {
        type: itemFormState.type,
        title,
        content: trimmedContent || null,
        url,
        metadata,
      },
      uploadedStoragePath,
    };
  }, [ensureReleaseSelected, itemFormState, uploadFolderFile]);

  const handleSubmitItem = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!user || !folder) {
        return;
      }

      setIsSubmittingItem(true);
      setModalError('');
      setPageError('');

      let uploadedStoragePath: string | null = null;

      try {
        const accessToken = await getAccessToken();
        const { payload, uploadedStoragePath: nextUploadedPath } = await buildItemPayload();
        uploadedStoragePath = nextUploadedPath;

        const response = await fetch(
          editingItem
            ? `/api/folders/${folder.id}/items/${editingItem.id}`
            : `/api/folders/${folder.id}/items`,
          {
            method: editingItem ? 'PATCH' : 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          }
        );

        const responsePayload = await parseApiPayload<FolderItemResponse>(response);
        if (!response.ok) {
          throw new Error(responsePayload.error || 'Could not save folder item.');
        }

        setIsItemModalOpen(false);
        setEditingItem(null);
        setItemFormState(buildEmptyFormState('note'));
        setToast({
          message: editingItem ? 'Item updated.' : 'Item added.',
          tone: 'success',
        });
        await loadFolderData(false);
      } catch (error) {
        if (uploadedStoragePath) {
          await supabase.storage.from(FOLDER_STORAGE_BUCKET).remove([uploadedStoragePath]).catch(() => {
            return null;
          });
        }

        setModalError(error instanceof Error ? error.message : 'Could not save folder item.');
      } finally {
        setIsSubmittingItem(false);
      }
    },
    [buildItemPayload, editingItem, folder, getAccessToken, loadFolderData, user]
  );

  const handleDeleteItem = useCallback(
    async (item: FolderItem) => {
      if (!folder) {
        return;
      }

      setOpenItemMenuId(null);
      if (!window.confirm(`Delete "${item.title}" from this folder?`)) {
        return;
      }

      setBusyItemId(item.id);
      setPageError('');

      try {
        const accessToken = await getAccessToken();
        const response = await fetch(`/api/folders/${folder.id}/items/${item.id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = await parseApiPayload<FolderApiError>(response);
        if (!response.ok) {
          throw new Error(payload.error || 'Could not delete item.');
        }

        setToast({ message: 'Item deleted.', tone: 'success' });
        await loadFolderData(false);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : 'Could not delete item.');
      } finally {
        setBusyItemId(null);
      }
    },
    [folder, getAccessToken, loadFolderData]
  );

  const handleMoveItem = useCallback(
    async (item: FolderItem, targetFolderId: string) => {
      if (!folder) {
        return;
      }

      setOpenItemMenuId(null);
      setBusyItemId(item.id);
      setPageError('');

      try {
        const accessToken = await getAccessToken();
        const response = await fetch(`/api/folders/${folder.id}/items/${item.id}/move`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            targetFolderId,
          }),
        });

        const payload = await parseApiPayload<FolderItemResponse>(response);
        if (!response.ok) {
          throw new Error(payload.error || 'Could not move item.');
        }

        const targetFolder = folders.find((entry) => entry.id === targetFolderId);
        setToast({
          message: targetFolder ? `Moved to ${targetFolder.name}.` : 'Item moved.',
          tone: 'success',
        });
        await loadFolderData(false);
      } catch (error) {
        setPageError(error instanceof Error ? error.message : 'Could not move item.');
      } finally {
        setBusyItemId(null);
      }
    },
    [folder, folders, getAccessToken, loadFolderData]
  );

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return <FolderDetailSkeleton />;
  }

  if (!user) {
    return <FolderDetailSkeleton />;
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[960px] px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
          <SectionCard className="rounded-[32px] p-6 text-center sm:p-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-content-tertiary">
              Folder Missing
            </p>
            <h1 className="mt-4 text-4xl text-content-primary">This folder is no longer here.</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-content-secondary sm:text-base">
              It may have been deleted or moved out of this workspace. Head back to your folders dashboard and open another one.
            </p>
            <div className="mt-6 flex justify-center">
              <Link
                href="/dashboard/folders"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-brand/20 bg-brand px-5 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover"
              >
                Back to folders
              </Link>
            </div>
          </SectionCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
        <SectionCard className="rounded-[32px] p-5 sm:p-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-content-tertiary">
            <Link href="/dashboard/folders" className="transition hover:text-content-primary">
              Folders
            </Link>
            <span className="mx-2 text-content-tertiary/60">/</span>
            {folder?.name || 'Workspace'}
          </p>

          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-4">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] border border-white/8 text-3xl"
                style={{ backgroundColor: `${folderVisual.color}22` }}
              >
                {folderVisual.icon}
              </div>

              <div>
                <h1 className="text-4xl text-content-primary sm:text-5xl">
                  {folder?.name || 'Folder'}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-content-secondary sm:text-base">
                  Keep the working parts of your music business in one sharp place so your team can find what matters without digging.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex min-h-11 items-center rounded-full border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-primary">
                    {folder?.itemCount || 0} item{folder?.itemCount === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex min-h-11 items-center rounded-full border border-stroke-default bg-bg-elevated px-4 text-sm font-semibold text-content-secondary">
                    Updated {formatLastUpdated(folder?.lastUpdatedAt || '')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" size="lg" onClick={() => void loadFolderData(false)}>
                Refresh
              </Button>
              <Button type="button" variant="primary" size="lg" onClick={() => openCreateItemModal('note')}>
                Add Item
              </Button>
            </div>
          </div>
        </SectionCard>

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
              description="Run this SQL once in Supabase, then reload the page to start saving notes, files, and business records."
              sql={schemaSql}
            />
          ) : null}
        </div>

        <SectionCard
          className="mt-5 rounded-[32px] p-4 sm:p-6"
          data-ph-capture-attribute-section="folders"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl text-content-primary">Folder items</h2>
              <p className="mt-2 text-sm text-content-secondary">
                Filter the view instantly, then edit, move, or remove any item without leaving the page.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedFilter('all')}
                className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition ${
                  selectedFilter === 'all'
                    ? 'border-brand/20 bg-brand text-content-inverse'
                    : 'border-stroke-default bg-bg-elevated text-content-secondary hover:text-content-primary'
                }`}
              >
                All
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em]">
                  {items.length}
                </span>
              </button>

              {FOLDER_ITEM_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedFilter(type)}
                  className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition ${
                    selectedFilter === type
                      ? 'border-brand/20 bg-brand text-content-inverse'
                      : 'border-stroke-default bg-bg-elevated text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {formatFolderItemTypeLabel(type)}
                  <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em]">
                    {filterCounts.get(type) || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="mt-6 rounded-[28px] border border-dashed border-stroke-default bg-bg-elevated/60 p-6 text-center sm:p-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                {selectedFilter === 'all' ? 'No items yet' : `${formatFolderItemTypeLabel(selectedFilter)} items`}
              </p>
              <h3 className="mt-3 text-3xl text-content-primary">
                {selectedFilter === 'all'
                  ? 'Start this folder with the piece you reach for most.'
                  : `No ${formatFolderItemTypeLabel(selectedFilter).toLowerCase()} items in view.`}
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-content-secondary">
                {selectedFilter === 'all'
                  ? 'Drop in a note, link, contract, contact, release, or file so this workspace becomes the source of truth for the rollout.'
                  : 'Switch filters or add a new item of this type to keep the folder complete.'}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    captureAnalyticsEvent({
                      name: 'empty_state_cta_clicked',
                      properties: {
                        feature: 'folders',
                        cta_label: `Add ${selectedFilter === 'all' ? 'Note' : formatFolderItemTypeLabel(selectedFilter)}`,
                      },
                    });
                    openCreateItemModal(selectedFilter === 'all' ? 'note' : selectedFilter);
                  }}
                >
                  Add {selectedFilter === 'all' ? 'Note' : formatFolderItemTypeLabel(selectedFilter)}
                </Button>
                {selectedFilter !== 'all' ? (
                  <Button type="button" variant="secondary" size="lg" onClick={() => setSelectedFilter('all')}>
                    Show all items
                  </Button>
                ) : null}
              </div>
            </div>
          ) : selectedFilter === 'contract' ? (
            <div className="mt-5 space-y-6">
              {CONTRACT_TYPES.map((contractType) => {
                const group = filteredItems.filter(
                  (item): item is Extract<FolderItem, { type: 'contract' }> =>
                    item.type === 'contract' && item.metadata.contractType === contractType
                );
                if (!group.length) return null;
                return (
                  <section key={contractType}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-lg font-semibold text-content-primary">
                        {formatContractTypeLabel(contractType)}
                      </h3>
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-content-tertiary">
                        {group.length} item{group.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-4 xl:grid-cols-2">
                      {group.map((item) => (
                        <FolderItemCard
                          key={item.id}
                          item={item}
                          folders={folders}
                          isMenuOpen={openItemMenuId === item.id}
                          isBusy={busyItemId === item.id}
                          onToggleMenu={() =>
                            setOpenItemMenuId((current) => (current === item.id ? null : item.id))
                          }
                          onEdit={openEditItemModal}
                          onDelete={(selectedItem) => void handleDeleteItem(selectedItem)}
                          onMove={(selectedItem, targetFolderId) => void handleMoveItem(selectedItem, targetFolderId)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {filteredItems.map((item) => (
                <FolderItemCard
                  key={item.id}
                  item={item}
                  folders={folders}
                  isMenuOpen={openItemMenuId === item.id}
                  isBusy={busyItemId === item.id}
                  onToggleMenu={() =>
                    setOpenItemMenuId((current) => (current === item.id ? null : item.id))
                  }
                  onEdit={openEditItemModal}
                  onDelete={(selectedItem) => void handleDeleteItem(selectedItem)}
                  onMove={(selectedItem, targetFolderId) => void handleMoveItem(selectedItem, targetFolderId)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {isItemModalOpen ? (
        <div className="fixed inset-0 z-[160]">
          <button
            type="button"
            aria-label="Close item modal"
            className="absolute inset-0 bg-black/70 backdrop-blur-[4px]"
            onClick={() => {
              if (!isSubmittingItem) {
                setIsItemModalOpen(false);
              }
            }}
          />

          <div className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
            <form
              onSubmit={(event) => void handleSubmitItem(event)}
              role="dialog"
              aria-modal="true"
              aria-labelledby="folder-item-modal-title"
              aria-describedby="folder-item-modal-description"
              data-ph-capture-attribute-section="folders"
              className="relative z-[1] w-full max-w-2xl rounded-[32px] border border-stroke-default bg-bg-surface/98 p-5 shadow-[0_28px_80px_-36px_rgba(0,0,0,0.72)] sm:p-7"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                    {editingItem ? 'Edit item' : 'Add item'}
                  </p>
                  <h2 id="folder-item-modal-title" className="mt-3 text-3xl text-content-primary">
                    {editingItem
                      ? `Update ${formatFolderItemTypeLabel(itemFormState.type).toLowerCase()}`
                      : 'Capture a new record'}
                  </h2>
                  <p id="folder-item-modal-description" className="mt-2 text-sm leading-7 text-content-secondary">
                    Add the details now so your future self can retrieve them in seconds.
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Close item modal"
                  onClick={() => {
                    if (!isSubmittingItem) {
                      setIsItemModalOpen(false);
                    }
                  }}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-stroke-default bg-bg-elevated text-content-secondary transition hover:text-content-primary"
                >
                  ×
                </button>
              </div>

              <div className="mt-6">
                <p className="text-sm font-semibold text-content-primary">Item type</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {FOLDER_ITEM_TYPES.map((type) => {
                    const isActive = itemFormState.type === type;
                    const isLocked = Boolean(editingItem);

                    return (
                      <button
                        key={type}
                        type="button"
                        disabled={isLocked}
                        onClick={() => {
                          if (isLocked) {
                            return;
                          }

                          setItemFormState(buildEmptyFormState(type));
                          setModalError('');
                          if (type === 'release' && !hasLoadedReleases) {
                            void loadReleases();
                          }
                        }}
                        className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition ${
                          isActive
                            ? 'border-brand/20 bg-brand text-content-inverse'
                            : 'border-stroke-default bg-bg-elevated text-content-secondary hover:text-content-primary'
                        } ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        {formatFolderItemTypeLabel(type)}
                      </button>
                    );
                  })}
                </div>
                {editingItem ? (
                  <p className="mt-2 text-xs text-content-tertiary">
                    Item type stays locked while editing so existing data stays consistent.
                  </p>
                ) : null}
              </div>

              {modalError ? (
                <p className="mt-5 rounded-[20px] border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
                  {modalError}
                </p>
              ) : null}

              <div className="mt-6 space-y-5">
                {itemFormState.type === 'release' ? (
                  <div>
                    <ReleaseCombobox
                      releases={releases}
                      selectedRelease={itemFormState.selectedRelease}
                      query={itemFormState.releaseQuery}
                      isLoading={isLoadingReleases}
                      isCreating={isCreatingInlineRelease}
                      onQueryChange={(value) =>
                        setItemFormState((current) => ({
                          ...current,
                          releaseQuery: value,
                        }))
                      }
                      onSelectRelease={(release) =>
                        setItemFormState((current) => ({
                          ...current,
                          selectedRelease: release,
                          releaseQuery: release.title,
                        }))
                      }
                      onCreateRelease={createInlineRelease}
                    />

                    {itemFormState.selectedRelease ? (
                      <div className="mt-4 rounded-[24px] border border-stroke-default bg-bg-elevated/70 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                          Selected release
                        </p>
                        <div className="mt-3 flex items-center gap-4">
                          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-stroke-default bg-bg-overlay text-xl">
                            {(itemFormState.selectedRelease.artistName || itemFormState.selectedRelease.title)
                              .trim()
                              .slice(0, 1)
                              .toUpperCase() || 'R'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-lg font-semibold text-content-primary">
                              {itemFormState.selectedRelease.title}
                            </p>
                            <p className="mt-1 truncate text-sm text-content-secondary">
                              {itemFormState.selectedRelease.artistName || 'Artist name pending'}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-content-tertiary">
                              {formatReleaseDate(itemFormState.selectedRelease.releaseDate)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-content-primary">
                      {itemFormState.type === 'contact' ? 'Contact name' : 'Title'}
                    </span>
                    <input
                      ref={modalTitleInputRef}
                      value={itemFormState.title}
                      onChange={(event) =>
                        setItemFormState((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder={
                        itemFormState.type === 'contact'
                          ? 'Playlist editor'
                          : itemFormState.type === 'contract'
                            ? 'Distribution agreement'
                            : itemFormState.type === 'file'
                              ? 'Press kit PDF'
                              : 'Title'
                      }
                      className="input h-12 rounded-[18px]"
                    />
                  </label>
                )}

                {itemFormState.type === 'note' ? (
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-content-primary">Note body</span>
                    <textarea
                      value={itemFormState.content}
                      onChange={(event) =>
                        setItemFormState((current) => ({
                          ...current,
                          content: event.target.value,
                        }))
                      }
                      placeholder="Capture the context, next step, or deal detail you’ll want later."
                      data-ph-no-capture
                      className="input min-h-[180px] rounded-[20px] py-3"
                    />
                  </label>
                ) : null}

                {itemFormState.type === 'link' ? (
                  <>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">URL</span>
                      <input
                        value={itemFormState.url}
                        onChange={(event) =>
                          setItemFormState((current) => ({
                            ...current,
                            url: event.target.value,
                          }))
                        }
                        placeholder="https://..."
                        className="input h-12 rounded-[18px]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">Description</span>
                      <textarea
                        value={itemFormState.content}
                        onChange={(event) =>
                          setItemFormState((current) => ({
                            ...current,
                            content: event.target.value,
                          }))
                        }
                        placeholder="Why this link matters"
                        className="input min-h-[140px] rounded-[20px] py-3"
                      />
                    </label>
                  </>
                ) : null}

                {itemFormState.type === 'file' ? (
                  <>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">Description</span>
                      <textarea
                        value={itemFormState.content}
                        onChange={(event) =>
                          setItemFormState((current) => ({
                            ...current,
                            content: event.target.value,
                          }))
                        }
                        placeholder="What this file is for"
                        className="input min-h-[140px] rounded-[20px] py-3"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">Upload file</span>
                      <input
                        type="file"
                        onChange={(event) =>
                          setItemFormState((current) => ({
                            ...current,
                            file: event.target.files?.[0] || null,
                          }))
                        }
                        className="block w-full rounded-[18px] border border-stroke-default bg-bg-elevated px-4 py-3 text-sm text-content-secondary file:mr-4 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-content-inverse"
                      />
                    </label>

                    {itemFormState.file ? (
                      <p className="rounded-[20px] border border-brand/20 bg-brand-muted/40 px-4 py-3 text-sm text-content-primary">
                        Selected {itemFormState.file.name} • {formatBytes(itemFormState.file.size)}
                      </p>
                    ) : itemFormState.existingFileUrl ? (
                      <div className="rounded-[20px] border border-stroke-default bg-bg-elevated/70 px-4 py-3 text-sm text-content-secondary">
                        <p className="font-semibold text-content-primary">
                          Current file: {itemFormState.existingFileName || 'Saved file'}
                        </p>
                        <p className="mt-1">
                          {formatBytes(itemFormState.existingFileSize)}
                          {itemFormState.existingMimeType ? ` • ${itemFormState.existingMimeType}` : ''}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}

                {itemFormState.type === 'contact' ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-content-primary">Role</span>
                        <input
                          value={itemFormState.contactRole}
                          onChange={(event) =>
                            setItemFormState((current) => ({
                              ...current,
                              contactRole: event.target.value,
                            }))
                          }
                          placeholder="Manager"
                          className="input h-12 rounded-[18px]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-content-primary">Email</span>
                        <input
                          value={itemFormState.contactEmail}
                          onChange={(event) =>
                            setItemFormState((current) => ({
                              ...current,
                              contactEmail: event.target.value,
                            }))
                          }
                          placeholder="name@example.com"
                          data-ph-no-capture
                          className="input h-12 rounded-[18px]"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">Phone</span>
                        <input
                          value={itemFormState.contactPhone}
                          onChange={(event) =>
                            setItemFormState((current) => ({
                              ...current,
                              contactPhone: event.target.value,
                            }))
                          }
                          placeholder="+1 555 555 5555"
                          data-ph-no-capture
                          className="input h-12 rounded-[18px]"
                        />
                      </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">Notes</span>
                      <textarea
                        value={itemFormState.content}
                        onChange={(event) =>
                          setItemFormState((current) => ({
                            ...current,
                            content: event.target.value,
                          }))
                        }
                        placeholder="Relationship notes, follow-up context, or negotiation details"
                        data-ph-no-capture
                        className="input min-h-[140px] rounded-[20px] py-3"
                      />
                    </label>
                  </>
                ) : null}

                {itemFormState.type === 'contract' ? (
                  <>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">Contract type</span>
                      <select
                        value={itemFormState.contractType}
                        onChange={(event) =>
                          setItemFormState((current) => ({
                            ...current,
                            contractType: event.target.value as ContractType,
                          }))
                        }
                        className="input h-12 rounded-[18px]"
                      >
                        {CONTRACT_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {formatContractTypeLabel(option)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs leading-5 text-content-secondary">
                        {itemFormState.contractType === 'split_sheet_master'
                          ? 'Covers ownership of the master recording. Pair with a separate publishing split sheet for the composition.'
                          : itemFormState.contractType === 'split_sheet_publishing'
                            ? 'Covers ownership of the underlying composition. Pair with a master split sheet for the recording side.'
                            : itemFormState.contractType === 'producer'
                              ? 'Producer agreements typically include points, advance, and credit terms.'
                              : itemFormState.contractType === 'distribution'
                                ? 'Distributor or label deal that pushes the release to DSPs.'
                                : 'For anything outside the standard recording, producer, distribution, or split sheet categories.'}
                      </p>
                    </label>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-content-primary">Counterparty</span>
                        <input
                          value={itemFormState.counterpartyName}
                          onChange={(event) =>
                            setItemFormState((current) => ({
                              ...current,
                              counterpartyName: event.target.value,
                            }))
                          }
                          placeholder="Distributor name"
                          data-ph-no-capture
                          className="input h-12 rounded-[18px]"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold text-content-primary">Signed date</span>
                        <input
                          type="date"
                          value={itemFormState.signedDate}
                          onChange={(event) =>
                            setItemFormState((current) => ({
                              ...current,
                              signedDate: event.target.value,
                            }))
                          }
                          className="input h-12 rounded-[18px]"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-content-primary">Upload contract</span>
                      <input
                        type="file"
                        onChange={(event) =>
                          setItemFormState((current) => ({
                            ...current,
                            file: event.target.files?.[0] || null,
                          }))
                        }
                        className="block w-full rounded-[18px] border border-stroke-default bg-bg-elevated px-4 py-3 text-sm text-content-secondary file:mr-4 file:rounded-full file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-content-inverse"
                      />
                    </label>

                    {itemFormState.file ? (
                      <p className="rounded-[20px] border border-brand/20 bg-brand-muted/40 px-4 py-3 text-sm text-content-primary">
                        Selected {itemFormState.file.name} • {formatBytes(itemFormState.file.size)}
                      </p>
                    ) : itemFormState.existingFileUrl ? (
                      <div className="rounded-[20px] border border-stroke-default bg-bg-elevated/70 px-4 py-3 text-sm text-content-secondary">
                        <p className="font-semibold text-content-primary">
                          Current contract: {itemFormState.existingFileName || 'Saved contract'}
                        </p>
                        <p className="mt-1">
                          {formatBytes(itemFormState.existingFileSize)}
                          {itemFormState.existingMimeType ? ` • ${itemFormState.existingMimeType}` : ''}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  onClick={() => setIsItemModalOpen(false)}
                  disabled={isSubmittingItem}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="lg" isLoading={isSubmittingItem}>
                  {editingItem ? 'Save changes' : 'Add item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

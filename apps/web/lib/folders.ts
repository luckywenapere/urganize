import {
  isValidEmail,
  isValidHttpUrl,
  sanitizeTextField,
  type PreSaveReleaseOption,
} from '@/lib/pre-save';

export const FOLDER_STORAGE_BUCKET = 'proofs';

export const FOLDER_ITEM_TYPES = [
  'note',
  'link',
  'file',
  'contact',
  'release',
  'contract',
] as const;

export type FolderItemType = (typeof FOLDER_ITEM_TYPES)[number];

export const FOLDER_COLOR_PRESETS = [
  '#3ECF8E',
  '#F59E0B',
  '#60A5FA',
  '#F87171',
  '#A78BFA',
  '#34D399',
] as const;

export const FOLDER_ICON_PRESETS = ['🎵', '📁', '📌', '🎤', '📄', '💼'] as const;

export interface Folder {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  lastUpdatedAt: string;
}

export interface NoteFolderItemMetadata {}

export interface LinkFolderItemMetadata {}

export interface FileFolderItemMetadata {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface ContactFolderItemMetadata {
  role: string | null;
  email: string | null;
  phone: string | null;
}

export interface ReleaseFolderItemMetadata {
  releaseId: string;
}

export interface ContractFolderItemMetadata extends FileFolderItemMetadata {
  counterpartyName: string | null;
  signedDate: string | null;
}

export type FolderItemMetadata =
  | NoteFolderItemMetadata
  | LinkFolderItemMetadata
  | FileFolderItemMetadata
  | ContactFolderItemMetadata
  | ReleaseFolderItemMetadata
  | ContractFolderItemMetadata;

interface FolderItemBase<TType extends FolderItemType, TMetadata extends FolderItemMetadata> {
  id: string;
  folderId: string;
  userId: string;
  type: TType;
  title: string;
  content: string | null;
  url: string | null;
  metadata: TMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface NoteFolderItem extends FolderItemBase<'note', NoteFolderItemMetadata> {}

export interface LinkFolderItem extends FolderItemBase<'link', LinkFolderItemMetadata> {}

export interface FileFolderItem extends FolderItemBase<'file', FileFolderItemMetadata> {}

export interface ContactFolderItem extends FolderItemBase<'contact', ContactFolderItemMetadata> {}

export interface ReleaseFolderItem extends FolderItemBase<'release', ReleaseFolderItemMetadata> {
  linkedRelease: PreSaveReleaseOption | null;
}

export interface ContractFolderItem extends FolderItemBase<'contract', ContractFolderItemMetadata> {}

export type FolderItem =
  | NoteFolderItem
  | LinkFolderItem
  | FileFolderItem
  | ContactFolderItem
  | ReleaseFolderItem
  | ContractFolderItem;

export type FolderApiError = {
  error: string;
  details?: string;
  sql?: string;
};

export type FolderListResponse = {
  folders: Folder[];
};

export type FolderResponse = {
  folder: Folder;
};

export type FolderItemsResponse = {
  items: FolderItem[];
};

export type FolderItemResponse = {
  item: FolderItem;
};

export type CreateFolderBody = {
  name?: string;
  color?: string | null;
  icon?: string | null;
};

export type UpdateFolderBody = CreateFolderBody;

export type CreateFolderItemBody = {
  type?: FolderItemType;
  title?: string;
  content?: string | null;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type UpdateFolderItemBody = CreateFolderItemBody;

export type MoveFolderItemBody = {
  targetFolderId?: string;
};

export function isFolderItemType(value: unknown): value is FolderItemType {
  return FOLDER_ITEM_TYPES.includes(String(value || '').trim() as FolderItemType);
}

export function sanitizeFolderName(value: unknown): string {
  return sanitizeTextField(String(value || ''), 80);
}

export function sanitizeFolderTitle(value: unknown): string {
  return sanitizeTextField(String(value || ''), 140);
}

export function sanitizeFolderContent(value: unknown): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 4000);
}

export function normalizeFolderColor(value: unknown): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  const presetMatch = FOLDER_COLOR_PRESETS.find(
    (preset) => preset.toLowerCase() === normalized.toLowerCase()
  );
  if (presetMatch) {
    return presetMatch;
  }

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }

  return sanitizeTextField(normalized, 24) || null;
}

export function normalizeFolderIcon(value: unknown): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 12);
}

export function normalizeFolderTypeFilter(value: string | null | undefined): FolderItemType | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }

  return isFolderItemType(normalized) ? normalized : null;
}

export function parseSignedDate(value: unknown): { value: string | null; error?: string } {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return { value: null };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { value: null, error: 'Signed date must use YYYY-MM-DD format.' };
  }

  const parsedDate = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return { value: null, error: 'Signed date is invalid.' };
  }

  return { value: normalized };
}

export function normalizeContactMetadata(value: unknown): {
  role: string | null;
  email: string | null;
  phone: string | null;
  error?: string;
} {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const role = sanitizeTextField(String(record.role || ''), 80) || null;
  const email = String(record.email || '').trim().toLowerCase() || null;
  const phone = sanitizeTextField(String(record.phone || ''), 40) || null;

  if (email && !isValidEmail(email)) {
    return { role, email: null, phone, error: 'Contact email must be valid.' };
  }

  return {
    role,
    email,
    phone,
  };
}

export function normalizeReleaseMetadata(value: unknown): {
  releaseId: string;
} {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  return {
    releaseId: sanitizeTextField(String(record.releaseId || ''), 80),
  };
}

export function normalizeFileMetadata(value: unknown): {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  error?: string;
} {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const storagePath = String(record.storagePath || '').trim();
  const fileName = sanitizeTextField(String(record.fileName || ''), 160);
  const fileSize = Number(record.fileSize || 0);
  const mimeType = sanitizeTextField(String(record.mimeType || ''), 120);

  if (!storagePath) {
    return { storagePath: '', fileName, fileSize: 0, mimeType, error: 'File upload is required.' };
  }

  if (fileSize < 0 || !Number.isFinite(fileSize)) {
    return { storagePath, fileName, fileSize: 0, mimeType, error: 'File size is invalid.' };
  }

  return {
    storagePath,
    fileName,
    fileSize,
    mimeType,
  };
}

export function normalizeContractMetadata(value: unknown): {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  counterpartyName: string | null;
  signedDate: string | null;
  error?: string;
} {
  const fileMetadata = normalizeFileMetadata(value);
  if (fileMetadata.error) {
    return {
      ...fileMetadata,
      counterpartyName: null,
      signedDate: null,
      error: fileMetadata.error,
    };
  }

  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const counterpartyName = sanitizeTextField(String(record.counterpartyName || ''), 140) || null;
  const signedDateResult = parseSignedDate(record.signedDate);

  if (signedDateResult.error) {
    return {
      ...fileMetadata,
      counterpartyName,
      signedDate: null,
      error: signedDateResult.error,
    };
  }

  if (!counterpartyName) {
    return {
      ...fileMetadata,
      counterpartyName: null,
      signedDate: signedDateResult.value,
      error: 'Counterparty name is required for contract items.',
    };
  }

  return {
    ...fileMetadata,
    counterpartyName,
    signedDate: signedDateResult.value,
  };
}

export function validateFolderItemInput(
  type: FolderItemType,
  input: {
    title: string;
    content: string | null;
    url: string | null;
    metadata: Record<string, unknown> | null | undefined;
  }
): { ok: true } | { ok: false; error: string } {
  if (type !== 'release' && !input.title) {
    return { ok: false, error: 'Title is required.' };
  }

  if (type === 'link' && (!input.url || !isValidHttpUrl(input.url))) {
    return { ok: false, error: 'Link URL must be valid.' };
  }

  if (type === 'file' && (!input.url || !isValidHttpUrl(input.url))) {
    return { ok: false, error: 'File URL must be valid.' };
  }

  if (type === 'contract' && (!input.url || !isValidHttpUrl(input.url))) {
    return { ok: false, error: 'Contract file URL must be valid.' };
  }

  if (type === 'contact') {
    const metadata = normalizeContactMetadata(input.metadata);
    if (metadata.error) {
      return { ok: false, error: metadata.error };
    }
  }

  if (type === 'release') {
    const metadata = normalizeReleaseMetadata(input.metadata);
    if (!metadata.releaseId) {
      return { ok: false, error: 'Release selection is required.' };
    }
  }

  if (type === 'file') {
    const metadata = normalizeFileMetadata(input.metadata);
    if (metadata.error) {
      return { ok: false, error: metadata.error };
    }
  }

  if (type === 'contract') {
    const metadata = normalizeContractMetadata(input.metadata);
    if (metadata.error) {
      return { ok: false, error: metadata.error };
    }
  }

  return { ok: true };
}

export function getFolderItemStoragePathFromUnknown(
  value: unknown
): string | null {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const storagePath = String(record.storagePath || '').trim();
  return storagePath || null;
}

export function extractStoragePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${FOLDER_STORAGE_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index < 0) {
    return null;
  }

  return decodeURIComponent(publicUrl.slice(index + marker.length));
}

export function formatFolderItemTypeLabel(type: FolderItemType): string {
  switch (type) {
    case 'note':
      return 'Note';
    case 'link':
      return 'Link';
    case 'file':
      return 'File';
    case 'contact':
      return 'Contact';
    case 'release':
      return 'Release';
    case 'contract':
      return 'Contract';
    default:
      return 'Item';
  }
}

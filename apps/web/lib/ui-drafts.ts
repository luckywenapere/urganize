import { supabase } from '@/lib/supabase/client';

type DraftApiResponse<T> = {
  draft?: {
    draftKey: string;
    scope: string;
    payload: T;
    updatedAt?: string | null;
  } | null;
  error?: string;
  sql?: string;
};

const getAccessToken = async (): Promise<string> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
};

export async function fetchUiDraft<T>(scope: string, draftKey: string): Promise<{ payload: T | null; updatedAt?: string | null }> {
  const token = await getAccessToken();
  if (!token || !scope || !draftKey) return { payload: null };

  const response = await fetch(
    `/api/ui-drafts?scope=${encodeURIComponent(scope)}&draftKey=${encodeURIComponent(draftKey)}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }
  );
  const payload = (await response.json().catch(() => ({}))) as DraftApiResponse<T>;
  if (!response.ok) return { payload: null, updatedAt: payload.draft?.updatedAt };
  return { payload: payload.draft?.payload || null, updatedAt: payload.draft?.updatedAt };
}

export async function saveUiDraft<T>(scope: string, draftKey: string, payload: T) {
  const token = await getAccessToken();
  if (!token || !scope || !draftKey) return;

  await fetch('/api/ui-drafts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ scope, draftKey, payload }),
  }).catch(() => undefined);
}

export async function deleteUiDraft(scope: string, draftKey: string) {
  const token = await getAccessToken();
  if (!token || !scope || !draftKey) return;

  await fetch(`/api/ui-drafts?scope=${encodeURIComponent(scope)}&draftKey=${encodeURIComponent(draftKey)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => undefined);
}

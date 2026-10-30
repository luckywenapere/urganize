'use client';

import { supabase } from '@/lib/supabase/client';

// What the brief scene and the brief board both need: the signed-in call to
// the brief routes, and the avatar the brief draws people with.

export async function briefAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export async function briefCall<T>(
  url: string,
  init: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const token = await briefAccessToken();
  if (!token) return { ok: false, error: 'Your session expired. Sign in again.' };
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) return { ok: false, error: payload.error || 'Something went wrong. Try again.' };
    return { ok: true, data: payload };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection.' };
  }
}

const AVATAR_COLORS = ['#7fd99a', '#e7c27d', '#9ab8f0', '#f0a39a', '#c5a3f0', '#8fd3d1'];

function avatarColor(key: string): string {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function BriefAvatar({
  label,
  colorKey,
  urgans = false,
  size = 26,
}: {
  label: string;
  colorKey: string;
  urgans?: boolean;
  size?: number;
}) {
  const box = { width: size, height: size };
  if (urgans) {
    return (
      <span
        aria-hidden="true"
        style={box}
        className="grid shrink-0 place-items-center rounded-full border border-brand/40 bg-bg-surface font-display text-[13px] text-brand"
      >
        u
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-bold text-[#0c0c0d]"
      style={{ ...box, background: avatarColor(colorKey), fontSize: size > 30 ? 12 : 9.5 }}
    >
      {label}
    </span>
  );
}

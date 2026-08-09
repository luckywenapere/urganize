// Compact relative-time formatter ("3m ago" / "4h ago" / "2d ago").
//
// Lived inline in components/app/NotificationsBell.tsx until the notes editor
// needed the same short-form label for its "Edited …" state. Promoted here on
// its second consumer, exactly as that file's comment anticipated.

export function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const seconds = Math.max(1, Math.round(diff / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

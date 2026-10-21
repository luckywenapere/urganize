// Whether a face should show its photo. A url that already failed to load
// stays on the initials tile until the url changes (a new signed link).
export function shouldShowPhoto(photoUrl: string | null | undefined, failedUrl: string | null): boolean {
  if (!photoUrl) return false;
  return photoUrl !== failedUrl;
}

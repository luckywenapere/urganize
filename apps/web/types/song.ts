/**
 * The song(s) attached to a release — the audio the whole rollout is about.
 *
 * Deliberately NOT a new object: a song is an `assets` row with
 * `category: 'audio'`, in the existing private `release-assets` bucket. That is
 * why this feature ships with no migration — the storage model, the RLS, the
 * per-release cleanup on release/account deletion, and the size/MIME rules all
 * already exist and already cover it (see lib/asset-constants.ts).
 *
 * The shape is narrower than `Asset` on purpose: the song surface never needs
 * the category (it is always 'audio'), the bucket, or the task link, and the
 * chat card that renders one should not be handed fields it has no business
 * with.
 */
export type ReleaseSong = {
  /** The underlying `assets` row id. */
  id: string;
  releaseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  storagePath: string;
  uploadedAt: string;
  /**
   * Short-lived signed download URL (ASSET_SIGNED_URL_TTL_SECONDS). Null when
   * signing failed — the row still renders, minus play/download, rather than
   * failing the whole scene for one bad URL.
   *
   * Because these expire, a song payload is never written to localStorage; see
   * SCENE_PERSISTED in lib/scene-cache.ts.
   */
  downloadUrl: string | null;
};

/**
 * A release's cover art — the single image `releases.artwork_asset_id` points
 * at. Distinct from `Asset` (assets.ts) for the same reason `ReleaseSong` is:
 * this surface only ever needs a narrow slice of the row, never its category
 * or task link, and it should not be handed fields it has no business with.
 *
 * Unlike a song, a release has AT MOST ONE current cover art — uploading a
 * new one replaces it (see the cover-art API routes), it doesn't add a
 * second row alongside the first. `lib/cover-art.ts` (the bulk resolver used
 * by the release cards/catalog) is a SEPARATE module from the upload flow
 * this type serves — don't conflate the two when editing either.
 */
export type ReleaseCoverArt = {
  /** The underlying `assets` row id — also `releases.artwork_asset_id`. */
  id: string;
  releaseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  storagePath: string;
  uploadedAt: string;
  /**
   * Short-lived signed download URL (ASSET_SIGNED_URL_TTL_SECONDS). Null when
   * signing failed — the row still renders, minus the preview image, rather
   * than failing the whole scene for one bad URL.
   *
   * Because these expire, a cover art payload is never written to
   * localStorage; see SCENE_PERSISTED in lib/scene-cache.ts.
   */
  downloadUrl: string | null;
};

// Release recap card (the shareable Wrapped-style poster). One recap per
// release; the images are re-rendered on every generate, so the client only
// ever holds freshly signed URLs.

export type ReleaseRecap = {
  id: string;
  releaseId: string;
  /** User-entered, optional. Null when they skipped the field. */
  firstWeekStreams: number | null;
  /** User-entered, optional. Null when they skipped the field. */
  highlight: string | null;
  generatedAt: string | null;
  /** Signed URLs, minted per request. Never persist these (they expire). */
  storyImageUrl: string | null;
  squareImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RecapInputs = {
  firstWeekStreams: number | null;
  highlight: string | null;
};

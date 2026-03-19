'use client';

type Step2ArtistDetailsProps = {
  fieldClass: string;
  artistName: string;
  genre: string;
  primaryPlatform: string;
  genreOptions: string[];
  primaryPlatformOptions: string[];
  isBusy: boolean;
  canContinueArtist: boolean;
  isArtistNameLocked?: boolean;
  onArtistNameChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onPrimaryPlatformChange: (value: string) => void;
  onPrimaryPlatformBlur: () => void;
  onContinue: () => Promise<void>;
};

export function Step2ArtistDetails({
  fieldClass,
  artistName,
  genre,
  primaryPlatform,
  genreOptions,
  primaryPlatformOptions,
  isBusy,
  canContinueArtist,
  isArtistNameLocked = false,
  onArtistNameChange,
  onGenreChange,
  onPrimaryPlatformChange,
  onPrimaryPlatformBlur,
  onContinue,
}: Step2ArtistDetailsProps) {
  return (
    <>
      <h1 className="mt-[18vh] text-[clamp(2.7rem,6.4vw,5rem)] tracking-tight">Add Artist</h1>
      <div className="mx-auto mt-10 grid w-full max-w-[720px] grid-cols-1 gap-5">
        <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Artist Name</label>
        <input
          className={fieldClass}
          value={artistName}
          onChange={(e) => onArtistNameChange(e.target.value)}
          placeholder="e.g. Tems"
          autoComplete="off"
          readOnly={isArtistNameLocked}
          disabled={isArtistNameLocked}
        />
        {isArtistNameLocked && (
          <p className="text-sm text-content-tertiary">
            Artist name is locked from your profile. You can change it in Settings.
          </p>
        )}
        <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Genre</label>
        <div>
          <input
            className={fieldClass}
            value={genre}
            onChange={(e) => onGenreChange(e.target.value)}
            list="genre-options"
            placeholder="Pick or type a genre (e.g. Afrobeats)"
            autoComplete="off"
          />
          <datalist id="genre-options">
            {genreOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
        <label className="text-[clamp(1.8rem,4vw,3.4rem)]">Primary Platform</label>
        <div>
          <input
            className={fieldClass}
            value={primaryPlatform}
            onChange={(e) => onPrimaryPlatformChange(e.target.value)}
            onBlur={onPrimaryPlatformBlur}
            list="primary-platform-options"
            placeholder="Pick or type a channel (e.g. TikTok)"
            autoComplete="off"
          />
          <datalist id="primary-platform-options">
            {primaryPlatformOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </div>
      </div>
      <button type="button" disabled={!canContinueArtist || isBusy} onClick={onContinue} className="mt-16 self-center text-[clamp(2.2rem,5vw,3.8rem)] disabled:opacity-40">
        Tap to Continue
      </button>
    </>
  );
}

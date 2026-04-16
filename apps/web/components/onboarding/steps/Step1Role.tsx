'use client';

type RoleOption = 'manager' | 'artist-team' | 'artist';

type Step1RoleProps = {
  isBusy: boolean;
  onSelectRole: (role: RoleOption) => void;
};

export function Step1Role({ isBusy, onSelectRole }: Step1RoleProps) {
  return (
    <>
      <h1 className="mt-[20vh] text-[clamp(2.4rem,6.2vw,5rem)] tracking-tight">Select Your Role.</h1>
      <div className="mt-20 space-y-4">
        <button type="button" onClick={() => onSelectRole('manager')} disabled={isBusy} className="flex w-full items-center justify-between text-left text-content-primary disabled:opacity-50">
          <span>
            <span className="block text-[clamp(2rem,4.5vw,3.3rem)]">Artist Manager</span>
            <span className="mt-1 block text-sm text-content-secondary">Manage multiple artists and delegate execution.</span>
          </span>
          <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[var(--brand-primary)]" />
        </button>
        <button type="button" onClick={() => onSelectRole('artist-team')} disabled={isBusy} className="flex w-full items-center justify-between text-left text-content-primary disabled:opacity-50">
          <span>
            <span className="block text-[clamp(2rem,4.5vw,3.3rem)]">Artist Team</span>
            <span className="mt-1 block text-sm text-content-secondary">Collaborate on tasks, playlists, and assets.</span>
          </span>
          <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[var(--brand-primary)]" />
        </button>
        <button type="button" onClick={() => onSelectRole('artist')} disabled={isBusy} className="flex w-full items-center justify-between text-left text-content-primary disabled:opacity-50">
          <span>
            <span className="block text-[clamp(2rem,4.5vw,3.3rem)]">Self-Managed Artist</span>
            <span className="mt-1 block text-sm text-content-secondary">Run your own campaign workflow without a manager.</span>
          </span>
          <span className="h-0 w-0 border-y-[18px] border-y-transparent border-r-[34px] border-r-[var(--brand-primary)]" />
        </button>
      </div>
    </>
  );
}

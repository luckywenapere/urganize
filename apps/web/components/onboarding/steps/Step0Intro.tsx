'use client';

type Step0IntroProps = {
  onContinue: () => void;
};

export function Step0Intro({ onContinue }: Step0IntroProps) {
  return (
    <section className="mx-auto mt-[12vh] w-full max-w-[860px] rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_80px_-46px_rgb(var(--shadow-ink)/calc(0.62*var(--shadow-alpha-scale)))] backdrop-blur-xl sm:p-8">
      <h1 className="text-[clamp(2.1rem,5.3vw,4rem)] tracking-tight text-content-primary">
        Urganize is your release execution workspace.
      </h1>
      <p className="mt-4 text-sm text-content-secondary sm:text-base">
        Use it to plan and run your release campaign with tasks, marketing calendar, playlist tracking, distribution checklist, and assets.
      </p>
      <div className="mt-5 rounded-2xl border border-stroke-default bg-bg-elevated/70 p-4">
        <p className="text-xs uppercase tracking-[0.14em] text-content-tertiary">Important</p>
        <p className="mt-2 text-sm text-content-secondary">
          Urganize does not distribute songs to DSPs, auto-pitch playlists, or create cover art for you. It helps you organize and execute those workflows.
        </p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="mt-8 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover sm:text-base"
      >
        Continue setup
      </button>
    </section>
  );
}

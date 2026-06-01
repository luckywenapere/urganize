'use client';

type GreetingHeaderProps = {
  userName?: string;
};

export function GreetingHeader({ userName }: GreetingHeaderProps) {
  const firstName = userName?.trim().split(/\s+/)[0];

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
        Workspace
      </p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">
        {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
      </h1>
    </div>
  );
}

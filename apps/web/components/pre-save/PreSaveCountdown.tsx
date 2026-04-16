'use client';

import { useEffect, useState } from 'react';
import { formatReleaseDate } from '@/lib/pre-save';

type CountdownState =
  | {
      mode: 'countdown';
      units: Array<{ label: string; value: string }>;
    }
  | {
      mode: 'released';
      label: string;
    };

function buildTargetDate(releaseDate: string): Date | null {
  const parsedDate = new Date(`${releaseDate}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function getCountdownState(releaseDate: string): CountdownState {
  const targetDate = buildTargetDate(releaseDate);
  if (!targetDate) {
    return {
      mode: 'released',
      label: 'Release date coming soon',
    };
  }

  const diffMs = targetDate.getTime() - Date.now();
  if (diffMs <= 0) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const isToday = targetDate.getTime() === startOfToday.getTime();

    return {
      mode: 'released',
      label: isToday ? 'Drops today' : 'Out now',
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    mode: 'countdown',
    units: [
      { label: 'Days', value: String(days).padStart(2, '0') },
      { label: 'Hours', value: String(hours).padStart(2, '0') },
      { label: 'Mins', value: String(minutes).padStart(2, '0') },
      { label: 'Secs', value: String(seconds).padStart(2, '0') },
    ],
  };
}

export function PreSaveCountdown({ releaseDate }: { releaseDate: string }) {
  const [countdown, setCountdown] = useState<CountdownState>(() => getCountdownState(releaseDate));

  useEffect(() => {
    setCountdown(getCountdownState(releaseDate));

    const intervalId = window.setInterval(() => {
      setCountdown(getCountdownState(releaseDate));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [releaseDate]);

  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_26px_80px_-54px_rgba(0,0,0,0.82)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">Release countdown</p>
          <p className="mt-2 text-sm text-white/70">{formatReleaseDate(releaseDate)}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          <span className="status-dot active" />
          Countdown live
        </div>
      </div>

      {countdown.mode === 'countdown' ? (
        <div className="mt-5 grid grid-cols-4 gap-3">
          {countdown.units.map((unit) => (
            <div
              key={unit.label}
              className="rounded-[22px] border border-white/10 bg-black/30 px-3 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <p className="text-2xl font-semibold tracking-[-0.06em] text-white sm:text-3xl">{unit.value}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">{unit.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-emerald-400/18 bg-emerald-400/10 px-4 py-5">
          <p className="text-lg font-semibold text-white">{countdown.label}</p>
          <p className="mt-2 text-sm text-white/68">
            The release date has arrived. Drop your email below and stay in the loop.
          </p>
        </div>
      )}
    </section>
  );
}

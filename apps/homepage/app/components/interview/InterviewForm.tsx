"use client";

import { useEffect, useState, type FormEvent } from "react";
import { SLOT_TIME_LABEL } from "@/lib/interview-slots";

type SlotOption = {
  date: string;
  label: string;
  available: boolean;
};

const inputClassName =
  "w-full rounded-full border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-5 py-3 text-sm text-[var(--marketing-text)] placeholder:text-[var(--marketing-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-text)] sm:text-base";

const buttonClassName =
  "relative z-[60] inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:text-base";

async function fetchSlots(): Promise<SlotOption[]> {
  const response = await fetch("/api/interview", { cache: "no-store" });
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => ({}))) as { slots?: SlotOption[] };
  return Array.isArray(payload.slots) ? payload.slots : [];
}

export function InterviewForm() {
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [artistName, setArtistName] = useState("");
  const [phone, setPhone] = useState("");
  const [imessage, setImessage] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSlots().then((result) => {
      if (!cancelled) {
        setSlots(result);
        setIsLoadingSlots(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!selectedDate) {
      setError("Pick a day for the interview.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistName: artistName.trim(),
          phone: phone.trim(),
          imessage: imessage.trim(),
          slotDate: selectedDate,
        }),
      });

      if (response.status === 409) {
        // Someone else took it between load and submit — refresh the list
        // so the taken slot shows as booked instead of a dead retry loop.
        setError("That time was just taken. Pick another below.");
        setSelectedDate("");
        setIsLoadingSlots(true);
        const refreshed = await fetchSlots();
        setSlots(refreshed);
        setIsLoadingSlots(false);
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error || "Something went wrong. Try again.");
        return;
      }

      setIsDone(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <div
        role="status"
        className="mx-auto w-full max-w-[28rem] rounded-2xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] px-6 py-5 text-center"
      >
        <p className="text-base font-medium text-[var(--marketing-text)]">
          You&apos;re booked — we&apos;ll reach out on iMessage before the interview.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-[34rem] flex-col gap-3 text-left">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          required
          minLength={1}
          maxLength={160}
          value={artistName}
          onChange={(event) => setArtistName(event.target.value)}
          placeholder="Artist name"
          aria-label="Artist name"
          className={inputClassName}
        />
        <input
          type="tel"
          required
          minLength={7}
          maxLength={32}
          pattern="[+\d\s().-]+"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Phone number"
          aria-label="Phone number"
          className={inputClassName}
        />
        <input
          type="text"
          required
          minLength={1}
          maxLength={200}
          value={imessage}
          onChange={(event) => setImessage(event.target.value)}
          placeholder="iMessage (phone or Apple ID email)"
          aria-label="iMessage phone number or Apple ID email"
          className={`${inputClassName} sm:col-span-2`}
        />
      </div>

      <div className="mt-2">
        <p className="mb-3 text-center font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
          PICK A DAY — {SLOT_TIME_LABEL}
        </p>

        {isLoadingSlots ? (
          <p className="text-center text-sm text-[var(--marketing-text-subtle)]">Loading available times…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {slots.map((slot) => {
              const isSelected = selectedDate === slot.date;
              return (
                <button
                  key={slot.date}
                  type="button"
                  disabled={!slot.available}
                  onClick={() => {
                    setError("");
                    setSelectedDate(slot.date);
                  }}
                  aria-pressed={isSelected}
                  className={`rounded-xl border px-3 py-2.5 text-center text-xs font-medium transition-colors sm:text-sm ${
                    !slot.available
                      ? "border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] text-[var(--marketing-text-subtle)] opacity-50 line-through"
                      : isSelected
                        ? "border-[color:var(--marketing-primary)] bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)]"
                        : "border-[color:var(--marketing-border-strong)] bg-[var(--marketing-surface)] text-[var(--marketing-text)] hover:border-[color:var(--marketing-primary)]"
                  }`}
                >
                  {slot.label}
                  {!slot.available ? (
                    <span className="mt-0.5 block text-[0.65rem] uppercase tracking-wide">Booked</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

      <div className="mt-2 flex flex-col items-center gap-3">
        <button type="submit" disabled={isSubmitting || isLoadingSlots} className={buttonClassName}>
          {isSubmitting ? "Booking…" : "Book the interview"}
        </button>
      </div>
    </form>
  );
}

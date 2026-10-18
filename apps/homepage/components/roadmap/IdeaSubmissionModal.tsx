"use client";

import { useState, type FormEvent } from "react";
import { submitIdea } from "@/lib/roadmap/queries";

type IdeaSubmissionModalProps = {
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
};

export function IdeaSubmissionModal({ userId, onClose, onSubmitted }: IdeaSubmissionModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setIsSubmitting(true);
    setError("");
    const { error: submitError } = await submitIdea({
      title: trimmedTitle,
      description: description.trim() || undefined,
      userId,
    });
    setIsSubmitting(false);

    if (submitError) {
      setError(submitError);
      return;
    }
    onSubmitted();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Suggest an idea"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[color:var(--marketing-border)] bg-[var(--marketing-surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg text-[var(--marketing-text)]">Suggest an idea</h3>
        <p className="mt-1 text-sm text-[var(--marketing-text-muted)]">
          We review every suggestion before it goes on the public board.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            type="text"
            required
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What should we build?"
            aria-label="Idea title"
            className="w-full rounded-lg border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-bg)] px-3 py-2.5 text-sm text-[var(--marketing-text)] placeholder:text-[var(--marketing-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-primary)]"
          />
          <textarea
            maxLength={4000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Any extra context (optional)"
            aria-label="Idea description"
            rows={4}
            className="w-full resize-none rounded-lg border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-bg)] px-3 py-2.5 text-sm text-[var(--marketing-text)] placeholder:text-[var(--marketing-text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--marketing-primary)]"
          />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-[color:var(--marketing-border-strong)] bg-[var(--marketing-secondary)] px-4 py-2.5 text-sm font-medium text-[var(--marketing-secondary-text)] hover:bg-[var(--marketing-secondary-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="flex-1 rounded-full bg-[var(--marketing-primary)] px-4 py-2.5 text-sm font-medium text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)] disabled:opacity-60"
            >
              {isSubmitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

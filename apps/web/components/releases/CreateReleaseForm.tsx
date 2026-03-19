'use client';

import { FormEvent } from 'react';

type ArtistOption = {
  id: string;
  label: string;
};

type CreateReleaseFormState = {
  artistId: string;
  artistName: string;
  title: string;
  releaseDate: string;
  description: string;
};

type CreateReleaseFormProps = {
  form: CreateReleaseFormState;
  artistOptions: ArtistOption[];
  error: string;
  isSubmitting: boolean;
  onChange: (patch: Partial<CreateReleaseFormState>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateReleaseForm({
  form,
  artistOptions,
  error,
  isSubmitting,
  onChange,
  onSubmit,
}: CreateReleaseFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Create release</p>
        <h1 className="mt-2 text-[clamp(2.2rem,5vw,3.5rem)] tracking-tight text-content-primary">
          Build the release workspace
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-content-secondary">
          Create the release, invite collaborators, collect credits, and keep metadata structured in one place.
        </p>
      </div>

      {error ? (
        <p className="rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
          {error}
        </p>
      ) : null}

      <label className="block text-sm">
        <span className="mb-1.5 block text-content-secondary">Artist</span>
        {artistOptions.length > 0 ? (
          <select
            value={form.artistId}
            onChange={(event) => {
              const option = artistOptions.find((item) => item.id === event.target.value);
              onChange({ artistId: event.target.value, artistName: option?.label || '' });
            }}
            className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
          >
            <option value="">Select artist</option>
            {artistOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={form.artistName}
            onChange={(event) => onChange({ artistName: event.target.value, artistId: '' })}
            placeholder="Artist name"
            className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
          />
        )}
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-content-secondary">Release title</span>
        <input
          value={form.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="e.g. Midnight Dreams"
          className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-content-secondary">Release date</span>
        <input
          type="date"
          value={form.releaseDate}
          onChange={(event) => onChange({ releaseDate: event.target.value })}
          className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1.5 block text-content-secondary">Description (optional)</span>
        <textarea
          value={form.description}
          onChange={(event) => onChange({ description: event.target.value })}
          rows={5}
          className="w-full rounded-2xl border border-stroke-subtle bg-bg-elevated px-4 py-3 outline-none focus:border-brand"
          placeholder="Optional context for the release team"
        />
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
      >
        {isSubmitting ? 'Creating release...' : 'Create release'}
      </button>
    </form>
  );
}

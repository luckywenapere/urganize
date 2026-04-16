'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MUSIC_GENRE_OPTIONS } from './genres';

type SearchableGenreSelectProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
};

export function SearchableGenreSelect({
  value,
  onChange,
  label,
  placeholder = 'Search genres',
  className = '',
}: SearchableGenreSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const filteredGenres = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return MUSIC_GENRE_OPTIONS;
    return MUSIC_GENRE_OPTIONS.filter((genre) => genre.toLowerCase().includes(normalizedQuery));
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="relative">
      {label && <span className="mb-2 block text-sm text-content-secondary">{label}</span>}
      <button
        type="button"
        onClick={() => {
          setIsOpen((current) => !current);
          setQuery('');
        }}
        className={`flex w-full items-center justify-between rounded-2xl border border-stroke-subtle bg-bg-elevated/70 px-4 py-3 text-left text-base text-content-primary outline-none transition focus:border-brand ${className}`}
      >
        <span className={value ? 'text-content-primary' : 'text-content-quaternary'}>{value || 'Select genre'}</span>
        <span className={`text-content-secondary transition ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface shadow-[0_24px_70px_-32px_rgba(0,0,0,0.78)]">
          <div className="border-b border-stroke-subtle px-3 py-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              autoFocus
              className="w-full rounded-xl border border-stroke-subtle bg-bg-elevated/70 px-3 py-2 text-sm text-content-primary outline-none placeholder:text-content-quaternary focus:border-brand"
            />
          </div>
          <div className="max-h-64 overflow-auto py-2">
            {filteredGenres.length > 0 ? (
              filteredGenres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => {
                    onChange(genre);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className={`block w-full px-4 py-2 text-left text-sm transition hover:bg-bg-hover ${
                    value === genre ? 'text-content-primary' : 'text-content-secondary'
                  }`}
                >
                  {genre}
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-content-secondary">No genre match found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

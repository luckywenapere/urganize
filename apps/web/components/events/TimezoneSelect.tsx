'use client';

import { useMemo } from 'react';
import { groupTimezones } from '@/lib/events';

/** A short list for the rare browser that cannot enumerate its zones. */
const FALLBACK_ZONES = [
  'Africa/Lagos',
  'Africa/Accra',
  'Africa/Johannesburg',
  'Africa/Nairobi',
  'Africa/Cairo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

function listZones(): string[] {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf;
    const zones = supported ? supported('timeZone') : [];
    return zones.length > 0 ? zones : FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

type TimezoneSelectProps = {
  value: string;
  onChange: (zone: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Every zone the browser knows, grouped by region and named the way a person
 * says it. A native select on purpose: on a phone it opens the system's own
 * wheel or list, which is faster than anything we would draw, and it is
 * searchable by typing on a desktop.
 */
export function TimezoneSelect({ value, onChange, id, className = '', disabled }: TimezoneSelectProps) {
  const groups = useMemo(() => groupTimezones(listZones(), value), [value]);

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    >
      {groups.map((group) => (
        <optgroup key={group.region} label={group.region}>
          {group.zones.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

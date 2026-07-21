'use client';

import { ThemeToggle } from '@urganize/ui';
import { panelClass } from './panelClass';

export function AppearanceSection() {
  return (
    <section className={panelClass}>
      <h2 className="mb-4 text-xl">Appearance</h2>
      <p className="mb-4 text-sm text-content-secondary">
        Choose how Urganize looks on this device.
      </p>
      <ThemeToggle />
    </section>
  );
}

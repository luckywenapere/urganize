'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/errors';
import { panelClass } from './panelClass';

export function SecuritySection() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async () => {
    setError('');
    setSuccess('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSaving(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (passwordError) throw passwordError;

      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated');
    } catch (err) {
      setError(errorMessage(err, 'Failed to update password'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={panelClass}>
      <h2 className="mb-4 text-xl">Security</h2>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-content-secondary">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-content-secondary">Confirm new password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-lg border border-stroke-subtle bg-bg-elevated px-3 py-2 text-content-primary outline-none focus:border-brand"
          />
        </label>
        {error && <p className="text-sm text-status-error">{error}</p>}
        {success && <p className="text-sm text-brand">{success}</p>}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
        >
          {isSaving ? 'Updating...' : 'Update password'}
        </button>
      </div>
    </section>
  );
}

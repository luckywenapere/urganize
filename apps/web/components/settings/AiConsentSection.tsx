'use client';

import { useState } from 'react';
import { Sparkles } from '@/components/icons';

import { AI_CONSENT_COPY, hasAiConsent, isAiConsentEnabled } from '@/lib/ai-consent';
import { useAuthStore } from '@/lib/auth-store';
import { SettingRow, settingRowButtonClass } from './SettingRow';

/**
 * The switch that lets someone take back the permission they gave on the AI
 * screen (lib/ai-consent.ts, Apple 5.1.2(i)). Turning it on from here is the
 * same agreement the screen collects; turning it off clears it, and every AI
 * route then refuses until they agree again. Hidden while the feature is off,
 * so it can never promise a control the server does not honour.
 */
export function AiConsentSection() {
  const user = useAuthStore((state) => state.user);
  const updateAiConsent = useAuthStore((state) => state.updateAiConsent);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  if (!isAiConsentEnabled()) return null;

  const isOn = hasAiConsent(user?.ai_consent_at);

  const handleToggle = async () => {
    setIsWorking(true);
    setError('');
    try {
      await updateAiConsent(!isOn);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this setting.');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="py-6 first:pt-0 last:pb-0">
      <SettingRow
        icon={
          <Sparkles
            className={`h-4 w-4 ${isOn ? 'text-brand' : 'text-content-tertiary'}`}
            aria-hidden="true"
          />
        }
        title={AI_CONSENT_COPY.settingsTitle}
        description={isOn ? AI_CONSENT_COPY.settingsOn : AI_CONSENT_COPY.settingsOff}
        action={
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={isWorking}
            className={settingRowButtonClass(isOn)}
          >
            {isWorking ? 'Working…' : isOn ? 'Turn off' : 'Turn on'}
          </button>
        }
        error={error}
      />
    </div>
  );
}

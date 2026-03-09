export const PAYWALL_SETTING_KEY = 'global_paywall';
export const DEFAULT_PAYWALL_ENABLED = true;

type SettingsRow = {
  value_json?: {
    enabled?: unknown;
  } | null;
  updated_at?: string | null;
};

export const resolvePaywallEnabled = (row: SettingsRow | null | undefined): boolean => {
  const enabled = row?.value_json?.enabled;
  return typeof enabled === 'boolean' ? enabled : DEFAULT_PAYWALL_ENABLED;
};

export const resolvePaywallUpdatedAt = (row: SettingsRow | null | undefined): string | null => {
  return typeof row?.updated_at === 'string' ? row.updated_at : null;
};

export const isMissingTableError = (error: unknown): boolean => {
  const code = String((error as { code?: string } | null)?.code || '').toUpperCase();
  const message = String((error as { message?: string } | null)?.message || '').toLowerCase();

  return (
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    (message.includes('relation') && message.includes('does not exist'))
  );
};

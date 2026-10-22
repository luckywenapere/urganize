// Columns and tables added by 20261022170000_trm_fee_and_price_lock.sql are written
// by code that may reach production before the migration is applied. Every
// such write tries WITH the new columns and, on these answers, again without,
// so a payment is never lost to a missing column. This is not the deprecated
// schema-missing fallback: no SQL or message goes to anyone.

type PgError = { code?: string | null; message?: string | null } | null | undefined;

/** "That column does not exist" from Postgres (42703) or PostgREST (PGRST204). */
export function isMissingColumnError(error: PgError): boolean {
  if (!error) return false;
  if (error.code === '42703' || error.code === 'PGRST204') return true;
  return /column .* does not exist|could not find the .* column/i.test(error.message || '');
}

/** "That table does not exist" from Postgres (42P01) or PostgREST (PGRST205). */
export function isMissingTableError(error: PgError): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .* does not exist|could not find the table/i.test(error.message || '');
}

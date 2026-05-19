/**
 * Narrow an unknown caught value into a user-facing error message.
 *
 * TypeScript's strict mode types caught errors as `unknown`, so call sites
 * can't reach `.message` without a guard. This helper centralizes the
 * Error → string → { message } → fallback walk so individual catch blocks
 * stay short:
 *
 *   } catch (err) {
 *     setError(errorMessage(err, "Failed to save"));
 *   }
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message || fallback;
  }
  if (typeof err === "string") {
    return err || fallback;
  }
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    const msg = (err as { message: string }).message;
    return msg || fallback;
  }
  return fallback;
}

/**
 * The second line under a teammate's name in Settings > Team: their email.
 * An invited person with no name yet is listed BY their email, so printing it
 * again underneath says the same thing twice; then there is no second line.
 * No email at all still reads "No email".
 */
export function teammateEmailLine(member: { name?: string | null; email?: string | null }): string | null {
  const email = String(member.email ?? '').trim();
  if (!email) return 'No email';
  const name = String(member.name ?? '').trim();
  return name.toLowerCase() === email.toLowerCase() ? null : email;
}

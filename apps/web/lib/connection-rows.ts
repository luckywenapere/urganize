/**
 * The rows the phone's Connections sheet offers. Only rows that open a real
 * settings section are listed (founder call, 2026-10-21): no "Soon"
 * placeholders and no plain-text rows that do nothing.
 */
export type ConnectionRow = { name: string; sub: string; section: string };

export function connectionRows(flags: { mcpConnect: boolean; dataExport: boolean }): ConnectionRow[] {
  const rows: ConnectionRow[] = [];
  if (flags.mcpConnect) rows.push({ name: 'Connected apps', sub: 'AI in Claude and ChatGPT', section: 'connected-apps' });
  if (flags.dataExport) rows.push({ name: 'Your data', sub: 'Download everything', section: 'export' });
  return rows;
}

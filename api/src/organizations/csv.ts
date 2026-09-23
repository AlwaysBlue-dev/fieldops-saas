/**
 * CSV helpers. Prefix formula-triggering cells so spreadsheet apps do not execute them.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  if (/^[=+\-@]/.test(text) || text.startsWith('\t') || text.startsWith('\r')) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function csvBuffer(headers: string[], rows: unknown[][]): Buffer {
  // UTF-8 BOM helps Excel open UTF-8 correctly
  return Buffer.from(`\uFEFF${toCsv(headers, rows)}`, 'utf8');
}

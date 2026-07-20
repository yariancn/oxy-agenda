/**
 * CSV download helpers for Excel / Numbers / Google Sheets.
 * Uses UTF-8 BOM so Excel on Windows opens accents correctly.
 */

export function escapeCsvCell(value) {
  const raw = value == null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function rowsToCsv(headers = [], rows = []) {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function downloadCsvFile(filename, csvText) {
  if (typeof window === 'undefined') return;
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = String(filename || 'reporte.csv').replace(/[^\w.\-() ]+/g, '_');
  a.href = url;
  a.download = safeName.endsWith('.csv') ? safeName : `${safeName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv({ filename, headers, rows }) {
  downloadCsvFile(filename, rowsToCsv(headers, rows));
}

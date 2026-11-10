/** CSV export helpers. Everything is built in the browser from data the signed-in user already loaded, so no new server access is involved. */
export type CsvCell = string | number | boolean | null | undefined;

/**
 * One CSV cell. Text that starts with = + - @ tab or carriage return would be run as a formula by Excel / Sheets ("CSV injection"),
 * so such text gets a leading apostrophe. Real numbers are written as they are (a negative amount stays a number).
 */
export function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Header row plus data rows, CRLF separated. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

/** UTF-8 byte order mark, so Excel opens Urdu text correctly. */
export const CSV_BOM = '﻿';

/** A safe file name: letters, digits, dash and underscore only, plus the date. */
export function csvFileName(base: string, day: string = new Date().toISOString().slice(0, 10)): string {
  const clean = base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'export';
  return `${clean}-${day}.csv`;
}

/** Starts a download of the CSV in the browser. */
export function downloadCsv(base: string, headers: string[], rows: CsvCell[][]): void {
  const blob = new Blob([CSV_BOM, toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = csvFileName(base);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

import { describe, expect, it } from 'vitest';
import { csvCell, csvFileName, toCsv } from './csv';

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
    expect(csvCell('plain')).toBe('plain');
  });
  it('defuses spreadsheet formulas in text but keeps real numbers', () => {
    for (const bad of ['=SUM(A1)', '+1', '-1', '@cmd', '\tTAB', '\rCR']) expect(csvCell(bad).replace(/"/g, '')).toMatch(/^'/);
    expect(csvCell(-500)).toBe('-500');
    expect(csvCell('Ali = good')).toBe('Ali = good');
    expect(csvCell("'=already")).toBe("'=already");
  });
  it('handles empty and special values', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(NaN)).toBe('');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(0)).toBe('0');
    expect(csvCell('علی خان')).toBe('علی خان');
  });
  it('joins rows with CRLF', () => {
    expect(toCsv(['Name', 'Marks'], [['Ali, K', 90], ['=1+1', null]])).toBe('Name,Marks\r\n"Ali, K",90\r\n\'=1+1,');
  });
  it('makes a safe file name with the date', () => {
    expect(csvFileName('Fee vouchers / 2026', '2026-11-09')).toBe('Fee-vouchers-2026-2026-11-09.csv');
    expect(csvFileName('../../etc', '2026-11-09')).toBe('etc-2026-11-09.csv');
    expect(csvFileName('***', '2026-11-09')).toBe('export-2026-11-09.csv');
  });
});

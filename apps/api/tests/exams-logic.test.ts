import { describe, expect, it } from 'vitest';
import { DEFAULT_BANDS, assignPositions, gradeFor, round2, studentResult, subjectResult, summarize, validMark, validateBands } from '../src/modules/exams/exams.logic';

const math = { subjectId: 'm', subjectName: 'Math', totalMarks: 100, passMarks: 33 };
const urdu = { subjectId: 'u', subjectName: 'Urdu', totalMarks: 50, passMarks: 17 };
const who = (id: string) => ({ id, admissionNo: id, name: id, sectionName: 'A' });
const marks = (m: number | null, isAbsent = false) => ({ marks: m, isAbsent });

describe('grades', () => {
  it('picks the highest band at or below the percentage', () => {
    expect(gradeFor(100, DEFAULT_BANDS)).toBe('A1');
    expect(gradeFor(80, DEFAULT_BANDS)).toBe('A1');
    expect(gradeFor(79.99, DEFAULT_BANDS)).toBe('A');
    expect(gradeFor(33, DEFAULT_BANDS)).toBe('E');
    expect(gradeFor(32.9, DEFAULT_BANDS)).toBe('F');
    expect(gradeFor(0, DEFAULT_BANDS)).toBe('F');
    expect(gradeFor(50, [])).toBeNull();
  });
  it('validates a scale', () => {
    expect(validateBands(DEFAULT_BANDS)).toBeNull();
    expect(validateBands([])).not.toBeNull();
    expect(validateBands([{ grade: 'A', minPercent: 50, remark: null }])).toMatch(/0%/);
    expect(validateBands([{ grade: 'A', minPercent: 0, remark: null }, { grade: 'a', minPercent: 50, remark: null }])).toMatch(/different/);
    expect(validateBands([{ grade: 'A', minPercent: 0, remark: null }, { grade: 'B', minPercent: 0, remark: null }])).toMatch(/same/);
  });
});

describe('marks and subject results', () => {
  it('accepts 0..total with at most 2 decimals', () => {
    expect(validMark(0, math)).toBe(true);
    expect(validMark(100, math)).toBe(true);
    expect(validMark(45.5, math)).toBe(true);
    expect(validMark(100.5, math)).toBe(false);
    expect(validMark(-1, math)).toBe(false);
    expect(validMark(45.555, math)).toBe(false);
    expect(validMark(Number.NaN, math)).toBe(false);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it('handles entered, absent and missing marks', () => {
    expect(subjectResult(math, marks(33), DEFAULT_BANDS)).toMatchObject({ entered: true, passed: true, percentage: 33, grade: 'E' });
    expect(subjectResult(math, marks(32), DEFAULT_BANDS)).toMatchObject({ passed: false, grade: 'F' });
    expect(subjectResult(math, marks(null, true), DEFAULT_BANDS)).toMatchObject({ entered: true, absent: true, marks: null, passed: false, percentage: 0 });
    expect(subjectResult(math, undefined, DEFAULT_BANDS)).toMatchObject({ entered: false, passed: null, percentage: null });
    expect(subjectResult(math, marks(null), DEFAULT_BANDS).entered).toBe(false);
  });
});

describe('student result', () => {
  const papers = [math, urdu];
  it('totals a complete student and fails them if any subject fails', () => {
    const ok = studentResult(who('a'), papers, new Map([['m', marks(80)], ['u', marks(40)]]), DEFAULT_BANDS);
    expect(ok).toMatchObject({ obtained: 120, total: 150, percentage: 80, grade: 'A1', passed: true, complete: true });
    const fail = studentResult(who('b'), papers, new Map([['m', marks(90)], ['u', marks(10)]]), DEFAULT_BANDS);
    expect(fail).toMatchObject({ obtained: 100, percentage: 66.67, passed: false, complete: true });
  });
  it('gives no overall percentage, grade or pass/fail until every paper is recorded', () => {
    const r = studentResult(who('c'), papers, new Map([['m', marks(90)]]), DEFAULT_BANDS);
    expect(r).toMatchObject({ complete: false, percentage: null, grade: null, passed: null, obtained: 90, total: 150 });
    expect(studentResult(who('d'), [], new Map(), DEFAULT_BANDS).complete).toBe(false);
  });
  it('ranks complete students with ties sharing a position (1, 2, 2, 4) and leaves incomplete ones unranked', () => {
    const mk = (id: string, m: number, u: number | null) => studentResult(who(id), papers, new Map(u === null ? [['m', marks(m)]] : [['m', marks(m)], ['u', marks(u)]]), DEFAULT_BANDS);
    const ranked = assignPositions([mk('s1', 90, 40), mk('s2', 80, 40), mk('s3', 80, 40), mk('s4', 50, 30), mk('s5', 99, null)]);
    const pos = Object.fromEntries(ranked.map((r) => [r.student.id, r.position]));
    expect(pos).toEqual({ s1: 1, s2: 2, s3: 2, s4: 4, s5: null });
  });
  it('summarizes pass rate over complete students only', () => {
    const mk = (id: string, m: number, u: number | null) => studentResult(who(id), [math, urdu], new Map(u === null ? [['m', marks(m)]] : [['m', marks(m)], ['u', marks(u)]]), DEFAULT_BANDS);
    expect(summarize([mk('a', 90, 40), mk('b', 10, 5), mk('c', 70, null)])).toEqual({ students: 3, complete: 2, incomplete: 1, passed: 1, failed: 1, passRate: 50 });
    expect(summarize([])).toMatchObject({ students: 0, passRate: null });
  });
});

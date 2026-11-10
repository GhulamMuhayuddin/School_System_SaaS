import type { GradeBandDto, PaperDto, StudentResult, SubjectResult, ResultSummary } from './exams.types';

/** Used until the school saves its own scale (a common Pakistani school scale: A1 80+ ... F below 33). */
export const DEFAULT_BANDS: GradeBandDto[] = [
  { grade: 'A1', minPercent: 80, remark: 'Outstanding' },
  { grade: 'A', minPercent: 70, remark: 'Excellent' },
  { grade: 'B', minPercent: 60, remark: 'Very good' },
  { grade: 'C', minPercent: 50, remark: 'Good' },
  { grade: 'D', minPercent: 40, remark: 'Satisfactory' },
  { grade: 'E', minPercent: 33, remark: 'Pass' },
  { grade: 'F', minPercent: 0, remark: 'Fail' },
];

/** Round to 2 decimals (marks like 45.5 and percentages like 66.67; avoids 0.1 + 0.2 style noise). */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** The band with the highest minPercent that is <= the percentage. Null when there are no bands. */
export function gradeFor(percentage: number, bands: GradeBandDto[]): string | null {
  const sorted = [...bands].sort((a, b) => b.minPercent - a.minPercent);
  return sorted.find((b) => percentage >= b.minPercent)?.grade ?? null;
}

/** A scale is usable when grades and minimums are unique and some band starts at 0 (so every percentage gets a grade). */
export function validateBands(bands: GradeBandDto[]): string | null {
  if (bands.length === 0) return 'Add at least one grade.';
  if (new Set(bands.map((b) => b.grade.toLowerCase())).size !== bands.length) return 'Each grade name must be different.';
  if (new Set(bands.map((b) => b.minPercent)).size !== bands.length) return 'Two grades cannot start at the same percentage.';
  if (!bands.some((b) => b.minPercent === 0)) return 'One grade must start at 0% so every student gets a grade.';
  return null;
}

export interface PaperLite { subjectId: string; subjectName: string; totalMarks: number; passMarks: number }
export interface MarkLite { marks: number | null; isAbsent: boolean }

/** One subject. Nothing recorded -> not entered (no pass/fail yet). Absent -> 0 marks and a fail. */
export function subjectResult(paper: PaperLite, mark: MarkLite | undefined, bands: GradeBandDto[]): SubjectResult {
  const base = { subjectId: paper.subjectId, subjectName: paper.subjectName, totalMarks: paper.totalMarks, passMarks: paper.passMarks };
  if (!mark || (mark.marks === null && !mark.isAbsent)) return { ...base, entered: false, marks: null, absent: false, percentage: null, grade: null, passed: null };
  const marks = mark.isAbsent ? 0 : (mark.marks as number);
  const percentage = paper.totalMarks === 0 ? 0 : round2((marks / paper.totalMarks) * 100);
  return { ...base, entered: true, marks: mark.isAbsent ? null : marks, absent: mark.isAbsent, percentage, grade: gradeFor(percentage, bands), passed: !mark.isAbsent && marks >= paper.passMarks };
}

/** All subjects of one student. Only a complete student (every paper recorded) gets an overall percentage, grade and pass/fail. */
export function studentResult(
  student: { id: string; admissionNo: string; name: string; sectionName: string | null },
  papers: PaperLite[],
  marksBySubject: Map<string, MarkLite>,
  bands: GradeBandDto[],
): StudentResult {
  const subjects = papers.map((p) => subjectResult(p, marksBySubject.get(p.subjectId), bands));
  const complete = subjects.length > 0 && subjects.every((s) => s.entered);
  const obtained = round2(subjects.reduce((sum, s) => sum + (s.marks ?? 0), 0));
  const total = round2(papers.reduce((sum, p) => sum + p.totalMarks, 0));
  const percentage = complete && total > 0 ? round2((obtained / total) * 100) : null;
  return {
    student, subjects, obtained, total, percentage, complete,
    grade: percentage === null ? null : gradeFor(percentage, bands),
    passed: complete ? subjects.every((s) => s.passed === true) : null,
    position: null,
  };
}

/** Standard competition ranking over complete students by marks obtained: 1, 2, 2, 4. Incomplete students get no position. */
export function assignPositions(results: StudentResult[]): StudentResult[] {
  const ranked = results.filter((r) => r.complete).sort((a, b) => b.obtained - a.obtained);
  const position = new Map<string, number>();
  ranked.forEach((r, i) => position.set(r.student.id, i > 0 && r.obtained === ranked[i - 1].obtained ? (position.get(ranked[i - 1].student.id) as number) : i + 1));
  return results.map((r) => ({ ...r, position: position.get(r.student.id) ?? null }));
}

export function summarize(results: StudentResult[]): ResultSummary {
  const complete = results.filter((r) => r.complete);
  const passed = complete.filter((r) => r.passed === true).length;
  return {
    students: results.length, complete: complete.length, incomplete: results.length - complete.length,
    passed, failed: complete.length - passed, passRate: complete.length === 0 ? null : Math.round((passed / complete.length) * 100),
  };
}

/** Marks are valid when between 0 and the paper total, with at most 2 decimals. */
export function validMark(marks: number, paper: Pick<PaperDto, 'totalMarks'>): boolean {
  return Number.isFinite(marks) && marks >= 0 && marks <= paper.totalMarks && round2(marks) === marks;
}

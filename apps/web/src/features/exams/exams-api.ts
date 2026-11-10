import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type ExamStatus = 'DRAFT' | 'PUBLISHED';
export interface GradeBand { grade: string; minPercent: number; remark: string | null }
export interface ExamDto { id: string; sessionId: string; sessionName: string; name: string; startDate: string | null; endDate: string | null; status: ExamStatus; publishedAt: string | null; paperCount: number }
export interface PaperDto { id: string; classId: string; className: string; subjectId: string; subjectName: string; totalMarks: number; passMarks: number; examDate: string | null; entered: number; students: number }
export interface ExamDetail extends ExamDto { papers: PaperDto[] }
export type MarkBlockReason = 'PUBLISHED' | 'NOT_YOUR_SUBJECT';
export interface MarkRow { studentId: string; admissionNo: string; name: string; sectionName: string | null; marks: number | null; absent: boolean; remark: string | null; entered: boolean }
export interface PaperMarks { exam: { id: string; name: string; status: ExamStatus }; paper: PaperDto; access: { canEnter: boolean; reason: MarkBlockReason | null }; students: MarkRow[] }
export interface MarkEntry { studentId: string; marks: number | null; absent: boolean }
export interface PaperInput { subjectId: string; totalMarks: number; passMarks: number }
export interface SubjectResult { subjectId: string; subjectName: string; totalMarks: number; passMarks: number; entered: boolean; marks: number | null; absent: boolean; percentage: number | null; grade: string | null; passed: boolean | null }
export interface StudentResult { student: { id: string; admissionNo: string; name: string; sectionName: string | null }; subjects: SubjectResult[]; obtained: number; total: number; percentage: number | null; grade: string | null; passed: boolean | null; complete: boolean; position: number | null }
export interface ResultSummary { students: number; complete: number; incomplete: number; passed: number; failed: number; passRate: number | null }
export interface ClassResults { exam: ExamDto; class: { id: string; name: string }; subjects: { subjectId: string; subjectName: string; totalMarks: number; passMarks: number }[]; students: StudentResult[]; summary: ResultSummary }

export const useExams = () => useQuery({ queryKey: ['exams', 'list'], queryFn: () => apiFetch<ExamDto[]>('/exams') });
export const useExam = (id: string | undefined) => useQuery({ queryKey: ['exams', 'detail', id], enabled: Boolean(id), queryFn: () => apiFetch<ExamDetail>(`/exams/${id}`) });
export const usePaperMarks = (paperId: string | undefined) => useQuery({ queryKey: ['exams', 'marks', paperId], enabled: Boolean(paperId), queryFn: () => apiFetch<PaperMarks>(`/exams/papers/${paperId}/marks`) });
export const useClassResults = (examId: string | undefined, classId: string | undefined, sectionId: string | undefined) =>
  useQuery({
    queryKey: ['exams', 'results', examId, classId, sectionId ?? ''], enabled: Boolean(examId && classId),
    queryFn: () => apiFetch<ClassResults>(`/exams/${examId}/results?classId=${classId}${sectionId ? `&sectionId=${sectionId}` : ''}`),
  });
export const useGradeBands = () => useQuery({ queryKey: ['exams', 'bands'], queryFn: () => apiFetch<{ bands: GradeBand[]; isDefault: boolean }>('/exams/grade-bands') });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }) });
}
export const useCreateExam = () => useRefreshing((v: { name: string; startDate: string | null; endDate: string | null }) => apiFetch<ExamDetail>('/exams', { method: 'POST', body: v }));
export const useDeleteExam = () => useRefreshing((id: string) => apiFetch<void>(`/exams/${id}`, { method: 'DELETE' }));
export const useSetPapers = (examId: string) =>
  useRefreshing((v: { classId: string; papers: PaperInput[] }) => apiFetch<ExamDetail>(`/exams/${examId}/classes/${v.classId}/papers`, { method: 'PUT', body: { papers: v.papers } }));
export const useSaveMarks = (paperId: string) => useRefreshing((entries: MarkEntry[]) => apiFetch<PaperMarks>(`/exams/papers/${paperId}/marks`, { method: 'PUT', body: { entries } }));
export const usePublish = (examId: string) => useRefreshing((force: boolean) => apiFetch<ExamDetail>(`/exams/${examId}/publish`, { method: 'POST', body: { force } }));
export const useUnpublish = (examId: string) => useRefreshing(() => apiFetch<ExamDetail>(`/exams/${examId}/unpublish`, { method: 'POST' }));
export const useSetBands = () => useRefreshing((bands: GradeBand[]) => apiFetch<{ bands: GradeBand[]; isDefault: boolean }>('/exams/grade-bands', { method: 'PUT', body: { bands } }));

/** Parses a typed mark. '' = nothing entered, 'a'/'A' = absent. Returns an error key when the text is not a valid mark for the paper. */
export function parseMark(text: string, total: number): { entry: { marks: number | null; absent: boolean } | null; error: 'invalid' | 'tooHigh' | null } {
  const v = text.trim();
  if (v === '') return { entry: { marks: null, absent: false }, error: null };
  if (/^a(bsent)?$/i.test(v)) return { entry: { marks: null, absent: true }, error: null };
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return { entry: null, error: 'invalid' };
  const n = Number(v);
  return n > total ? { entry: null, error: 'tooHigh' } : { entry: { marks: n, absent: false }, error: null };
}
export const markText = (r: { marks: number | null; absent: boolean }): string => (r.absent ? 'A' : r.marks === null ? '' : String(r.marks));

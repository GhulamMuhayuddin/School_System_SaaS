import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type SubmissionStatus = 'SUBMITTED' | 'LATE' | 'MISSING';
export type HomeworkState = 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE';
export interface Tally { students: number; submitted: number; late: number; missing: number; pending: number }
export interface HomeworkItem {
  id: string; title: string; description: string | null; assignedDate: string; dueDate: string; maxMarks: number | null; state: HomeworkState;
  class: { id: string; name: string }; section: { id: string; name: string }; subject: { id: string; name: string }; counts: Tally;
}
export interface RosterRow { studentId: string; admissionNo: string; name: string; status: SubmissionStatus | null; marks: number | null; remark: string | null }
export interface HomeworkDetail extends HomeworkItem { roster: RosterRow[]; access: { canEdit: boolean; reason: 'NOT_YOUR_SUBJECT' | null } }
export interface ChildHomework {
  id: string; title: string; description: string | null; subject: string; assignedDate: string; dueDate: string; maxMarks: number | null; state: HomeworkState;
  status: SubmissionStatus | 'PENDING'; marks: number | null; remark: string | null;
}
export interface HomeworkFilter { classId?: string; sectionId?: string; subjectId?: string; from?: string; to?: string; mine?: boolean }
export interface NewHomework { sectionId: string; subjectId: string; title: string; description: string | null; dueDate: string; maxMarks: number | null }
export interface HomeworkEdit { title?: string; description?: string | null; dueDate?: string; maxMarks?: number | null }
export interface SubmissionEntry { studentId: string; status: SubmissionStatus | null; marks: number | null; remark: string | null }

export const todayText = (now: Date = new Date()): string => now.toISOString().slice(0, 10);
export const stateTone = (s: HomeworkState): 'brand' | 'warning' | 'neutral' => (s === 'UPCOMING' ? 'brand' : s === 'DUE_TODAY' ? 'warning' : 'neutral');
export const statusTone = (s: SubmissionStatus | 'PENDING'): 'success' | 'warning' | 'danger' | 'neutral' =>
  s === 'SUBMITTED' ? 'success' : s === 'LATE' ? 'warning' : s === 'MISSING' ? 'danger' : 'neutral';

/** One editable row of the checklist (marks and remark are text while typing). */
export interface DraftRow { status: SubmissionStatus | null; marks: string; remark: string }
export type Draft = Record<string, DraftRow>;
export const draftOf = (roster: RosterRow[]): Draft =>
  Object.fromEntries(roster.map((r) => [r.studentId, { status: r.status, marks: r.marks === null ? '' : String(r.marks), remark: r.remark ?? '' }]));
/** Marks text -> whole number, null when empty, undefined when it is not a valid whole number. */
export const parseMarks = (text: string): number | null | undefined => {
  const t = text.trim();
  if (t === '') return null;
  return /^\d{1,4}$/.test(t) ? Number(t) : undefined;
};
/** Rows that differ from what is saved. Marks are dropped for a missing or unchecked student. Returns null when some marks text is invalid or above the maximum. */
export function changedEntries(roster: RosterRow[], draft: Draft, maxMarks: number | null): SubmissionEntry[] | null {
  const out: SubmissionEntry[] = [];
  for (const r of roster) {
    const d = draft[r.studentId];
    if (!d) continue;
    const handedIn = d.status === 'SUBMITTED' || d.status === 'LATE';
    const marks = handedIn ? parseMarks(d.marks) : null;
    if (marks === undefined || (marks !== null && (maxMarks === null || marks > maxMarks))) return null;
    const remark = d.status === null ? null : d.remark.trim() || null;
    if (d.status !== r.status || marks !== r.marks || remark !== r.remark) out.push({ studentId: r.studentId, status: d.status, marks, remark });
  }
  return out;
}

const qs = (o: Record<string, string | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
export const useHomeworkList = (f: HomeworkFilter) => useQuery({ queryKey: ['homework', 'list', f], queryFn: () => apiFetch<HomeworkItem[]>(`/homework${qs({ ...f })}`) });
export const useHomework = (id: string | undefined) => useQuery({ queryKey: ['homework', 'one', id], enabled: Boolean(id), queryFn: () => apiFetch<HomeworkDetail>(`/homework/${id}`) });
export const useChildHomework = (studentId: string) => useQuery({ queryKey: ['portal', 'homework', studentId], queryFn: () => apiFetch<ChildHomework[]>(`/portal/children/${studentId}/homework`) });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['homework'] }) });
}
export const useCreateHomework = () => useRefreshing((v: NewHomework) => apiFetch<HomeworkDetail>('/homework', { method: 'POST', body: v }));
export const useUpdateHomework = () => useRefreshing((v: { id: string; patch: HomeworkEdit }) => apiFetch<HomeworkDetail>(`/homework/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useDeleteHomework = () => useRefreshing((id: string) => apiFetch<void>(`/homework/${id}`, { method: 'DELETE' }));
export const useSaveSubmissions = () => useRefreshing((v: { id: string; entries: SubmissionEntry[] }) => apiFetch<HomeworkDetail>(`/homework/${v.id}/submissions`, { method: 'PUT', body: { entries: v.entries } }));

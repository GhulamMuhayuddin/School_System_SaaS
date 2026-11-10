import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface SessionDto { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }
export interface SubjectDto { id: string; name: string; code: string | null; classCount: number }
export interface ClassSubjects { classId: string; subjects: { id: string; name: string; code: string | null }[] }
export interface PeriodDto { id: string; name: string; startTime: string; endTime: string; sortOrder: number; isBreak: boolean }
export interface PersonRef { id: string; name: string }
export interface SectionRef { id: string; name: string; classId: string; className: string }
export interface TeacherOption { id: string; name: string; employeeNo: string }
export interface AssignmentDto { id: string; sessionId: string; staff: PersonRef; section: SectionRef; subject: { id: string; name: string } }
export interface EntryDto { id: string; dayOfWeek: number; period: PeriodDto; subject: { id: string; name: string }; staff: PersonRef | null; room: string | null }
export interface SectionTimetable { session: { id: string; name: string }; section: SectionRef; periods: PeriodDto[]; entries: (EntryDto & { sectionId: string })[] }
export interface TeacherTimetable { session: { id: string; name: string }; staff: PersonRef; periods: PeriodDto[]; entries: (EntryDto & { section: SectionRef })[] }

/** Monday = 1 ... Sunday = 7 (same numbers as the API). */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

// Every key starts with 'academics' so the class/student pages (which already invalidate 'academics') stay in sync.
const k = {
  sessions: ['academics', 'sessions'] as const,
  subjects: ['academics', 'subjects'] as const,
  classSubjects: (id: string) => ['academics', 'class-subjects', id] as const,
  periods: ['academics', 'periods'] as const,
  teachers: ['academics', 'teachers'] as const,
  assignments: (f: object) => ['academics', 'assignments', f] as const,
  section: (id: string) => ['academics', 'timetable', 'section', id] as const,
  teacher: (id: string) => ['academics', 'timetable', 'teacher', id] as const,
  my: ['academics', 'timetable', 'my'] as const,
};

export const useSessions = () => useQuery({ queryKey: k.sessions, queryFn: async () => (await apiFetch<{ sessions: SessionDto[] }>('/academics/sessions')).sessions });
export const useSubjects = () => useQuery({ queryKey: k.subjects, queryFn: async () => (await apiFetch<{ subjects: SubjectDto[] }>('/academics/subjects')).subjects });
export const useClassSubjects = (classId: string | undefined) =>
  useQuery({ queryKey: k.classSubjects(classId ?? ''), enabled: Boolean(classId), queryFn: () => apiFetch<ClassSubjects>(`/academics/classes/${classId}/subjects`) });
export const usePeriods = () => useQuery({ queryKey: k.periods, queryFn: async () => (await apiFetch<{ periods: PeriodDto[] }>('/timetable/periods')).periods });
export const useTeachers = () => useQuery({ queryKey: k.teachers, queryFn: async () => (await apiFetch<{ teachers: TeacherOption[] }>('/timetable/teachers')).teachers });
export const useAssignments = (f: { sectionId?: string; staffId?: string }, enabled = true) =>
  useQuery({
    queryKey: k.assignments(f), enabled,
    queryFn: async () => {
      const p = new URLSearchParams();
      for (const [key, v] of Object.entries(f)) if (v) p.set(key, v);
      return (await apiFetch<{ assignments: AssignmentDto[] }>(`/timetable/assignments?${p}`)).assignments;
    },
  });
export const useSectionTimetable = (sectionId: string | undefined) =>
  useQuery({ queryKey: k.section(sectionId ?? ''), enabled: Boolean(sectionId), queryFn: () => apiFetch<SectionTimetable>(`/timetable/sections/${sectionId}`) });
export const useTeacherTimetable = (staffId: string | undefined) =>
  useQuery({ queryKey: k.teacher(staffId ?? ''), enabled: Boolean(staffId), queryFn: () => apiFetch<TeacherTimetable>(`/timetable/teachers/${staffId}`) });
export const useMyTimetable = (enabled = true) => useQuery({ queryKey: k.my, enabled, retry: false, queryFn: () => apiFetch<TeacherTimetable>('/timetable/my') });

/** Anything academic can change what other academic screens show (a new teacher moves lessons, a new subject changes class lists...), so refresh them all. */
function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['academics'] }) });
}

export const useSessionActions = () => ({
  create: useRefreshing((v: { name: string; startDate: string; endDate: string; isCurrent?: boolean }) => apiFetch<{ session: SessionDto }>('/academics/sessions', { method: 'POST', body: v })),
  update: useRefreshing((v: { id: string; name?: string; startDate?: string; endDate?: string }) => { const { id, ...body } = v; return apiFetch<{ session: SessionDto }>(`/academics/sessions/${id}`, { method: 'PATCH', body }); }),
  setCurrent: useRefreshing((id: string) => apiFetch<{ session: SessionDto }>(`/academics/sessions/${id}/current`, { method: 'POST' })),
  remove: useRefreshing((id: string) => apiFetch<void>(`/academics/sessions/${id}`, { method: 'DELETE' })),
});
export const useSubjectActions = () => ({
  create: useRefreshing((v: { name: string; code?: string | null }) => apiFetch<{ subject: SubjectDto }>('/academics/subjects', { method: 'POST', body: v })),
  update: useRefreshing((v: { id: string; name?: string; code?: string | null }) => { const { id, ...body } = v; return apiFetch<{ subject: SubjectDto }>(`/academics/subjects/${id}`, { method: 'PATCH', body }); }),
  remove: useRefreshing((id: string) => apiFetch<void>(`/academics/subjects/${id}`, { method: 'DELETE' })),
  setForClass: useRefreshing((v: { classId: string; subjectIds: string[] }) => apiFetch<ClassSubjects>(`/academics/classes/${v.classId}/subjects`, { method: 'PUT', body: { subjectIds: v.subjectIds } })),
});
export const usePeriodActions = () => ({
  create: useRefreshing((v: { name: string; startTime: string; endTime: string; isBreak?: boolean }) => apiFetch<{ period: PeriodDto }>('/timetable/periods', { method: 'POST', body: v })),
  update: useRefreshing((v: { id: string; name?: string; startTime?: string; endTime?: string; isBreak?: boolean }) => { const { id, ...body } = v; return apiFetch<{ period: PeriodDto }>(`/timetable/periods/${id}`, { method: 'PATCH', body }); }),
  remove: useRefreshing((id: string) => apiFetch<void>(`/timetable/periods/${id}`, { method: 'DELETE' })),
});
export const useAssignmentActions = () => ({
  assign: useRefreshing((v: { sectionId: string; subjectId: string; staffId: string }) => apiFetch<{ assignment: AssignmentDto }>('/timetable/assignments', { method: 'POST', body: v })),
  remove: useRefreshing((id: string) => apiFetch<void>(`/timetable/assignments/${id}`, { method: 'DELETE' })),
});
export const useEntryActions = () => ({
  set: useRefreshing((v: { sectionId: string; dayOfWeek: number; periodId: string; subjectId: string; room?: string | null }) => apiFetch<{ entry: EntryDto }>('/timetable/entries', { method: 'PUT', body: v })),
  remove: useRefreshing((id: string) => apiFetch<void>(`/timetable/entries/${id}`, { method: 'DELETE' })),
});

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'WITHDRAWN' | 'TRANSFERRED' | 'GRADUATED';
export type GuardianRelation = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';
export const GENDERS: Gender[] = ['MALE', 'FEMALE', 'OTHER'];
export const STATUSES: StudentStatus[] = ['ACTIVE', 'WITHDRAWN', 'TRANSFERRED', 'GRADUATED'];
export const RELATIONS: GuardianRelation[] = ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'];

export interface GuardianLink {
  linkId: string; guardianId: string; name: string; phone: string; email: string | null; occupation: string | null;
  address: string | null; relation: GuardianRelation; isPrimary: boolean; hasAccount: boolean;
}
export interface StudentRow {
  id: string; admissionNo: string; firstName: string; lastName: string; gender: Gender; status: StudentStatus;
  class: { id: string; name: string }; section: { id: string; name: string } | null; primaryGuardian: { name: string; phone: string } | null;
}
export interface StudentDetail extends StudentRow {
  dateOfBirth: string; bloodGroup: string | null; phone: string | null; address: string | null; previousSchool: string | null; notes: string | null;
  admissionDate: string; leftAt: string | null; leftReason: string | null; createdAt: string; guardians: GuardianLink[];
  hasAccount: boolean;
  siblings: { id: string; admissionNo: string; firstName: string; lastName: string; class: string }[];
}
export interface ClassOption { id: string; name: string; level: number; sections: { id: string; name: string; capacity: number | null }[] }
export interface GuardianValues { name: string; phone: string; email?: string; occupation?: string; relation: GuardianRelation; isPrimary?: boolean }
export interface CreateStudentValues {
  admissionNo?: string; firstName: string; lastName: string; gender: Gender; dateOfBirth: string; bloodGroup?: string;
  phone?: string; address?: string; previousSchool?: string; notes?: string; classId: string; sectionId?: string | null;
  admissionDate: string; guardians: GuardianValues[];
}

export interface ClassDto {
  id: string; name: string; level: number; studentCount: number;
  sections: { id: string; classId: string; name: string; capacity: number | null; studentCount: number }[];
}

const key = {
  options: ['students', 'options'] as const,
  list: (f: object) => ['students', 'list', f] as const,
  one: (id: string) => ['students', 'one', id] as const,
  classes: ['academics', 'classes'] as const,
};

export const useStudentOptions = () => useQuery({ queryKey: key.options, queryFn: async () => (await apiFetch<{ options: { classes: ClassOption[] } }>('/students/options')).options.classes });
export const useStudents = (f: { q?: string; classId?: string; sectionId?: string; status?: StudentStatus }) =>
  useQuery({
    queryKey: key.list(f),
    queryFn: async () => {
      const p = new URLSearchParams({ limit: '2000' });
      for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
      return apiFetch<{ students: StudentRow[]; total: number }>(`/students?${p}`);
    },
  });
export const useStudent = (id: string) => useQuery({ queryKey: key.one(id), queryFn: async () => (await apiFetch<{ student: StudentDetail }>(`/students/${id}`)).student });
export const useClasses = () => useQuery({ queryKey: key.classes, queryFn: async () => (await apiFetch<{ classes: ClassDto[] }>('/academics/classes')).classes });

/** Students, class counts and the pickers all depend on each other, so any change refreshes all of them. */
function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ['students'] }), qc.invalidateQueries({ queryKey: ['academics'] })]);
    },
  });
}

export const useCreateStudent = () => useRefreshing((v: CreateStudentValues) => apiFetch<{ student: StudentDetail }>('/students', { method: 'POST', body: v }));
export const useUpdateStudent = (id: string) => useRefreshing((v: object) => apiFetch<{ student: StudentDetail }>(`/students/${id}`, { method: 'PATCH', body: v }));
export const useWithdrawStudent = (id: string) => useRefreshing((v: { status: 'WITHDRAWN' | 'TRANSFERRED' | 'GRADUATED'; date: string; reason?: string }) => apiFetch<{ student: StudentDetail }>(`/students/${id}/withdraw`, { method: 'POST', body: v }));
export const useReinstateStudent = (id: string) => useRefreshing(() => apiFetch<{ student: StudentDetail }>(`/students/${id}/reinstate`, { method: 'POST' }));
export const useDeleteStudent = (id: string) => useRefreshing(() => apiFetch<void>(`/students/${id}`, { method: 'DELETE' }));
export const useAddGuardian = (id: string) => useRefreshing((v: GuardianValues) => apiFetch<{ student: StudentDetail }>(`/students/${id}/guardians`, { method: 'POST', body: v }));
export const useUpdateGuardian = (id: string) => useRefreshing((v: { linkId: string } & Partial<GuardianValues>) => {
  const { linkId, ...body } = v;
  return apiFetch<{ student: StudentDetail }>(`/students/${id}/guardians/${linkId}`, { method: 'PATCH', body });
});
export const useRemoveGuardian = (id: string) => useRefreshing((linkId: string) => apiFetch<{ student: StudentDetail }>(`/students/${id}/guardians/${linkId}`, { method: 'DELETE' }));

export const useClassActions = () => ({
  createClass: useRefreshing((v: { name: string; level: number }) => apiFetch<{ class: ClassDto }>('/academics/classes', { method: 'POST', body: v })),
  updateClass: useRefreshing((v: { id: string; name?: string; level?: number }) => { const { id, ...b } = v; return apiFetch<{ class: ClassDto }>(`/academics/classes/${id}`, { method: 'PATCH', body: b }); }),
  deleteClass: useRefreshing((id: string) => apiFetch<void>(`/academics/classes/${id}`, { method: 'DELETE' })),
  createSection: useRefreshing((v: { classId: string; name: string; capacity: number | null }) => { const { classId, ...b } = v; return apiFetch<{ class: ClassDto }>(`/academics/classes/${classId}/sections`, { method: 'POST', body: b }); }),
  updateSection: useRefreshing((v: { id: string; name?: string; capacity?: number | null }) => { const { id, ...b } = v; return apiFetch<{ class: ClassDto }>(`/academics/sections/${id}`, { method: 'PATCH', body: b }); }),
  deleteSection: useRefreshing((id: string) => apiFetch<void>(`/academics/sections/${id}`, { method: 'DELETE' })),
});

export const useCreateStudentAccount = (studentId: string) =>
  useRefreshing((v: { email: string; password: string }) => apiFetch<{ user: { id: string; email: string } }>(`/school/students/${studentId}/account`, { method: 'POST', body: v }));

export const useCreateGuardianAccount = (studentId: string) =>
  useRefreshing((v: { guardianId: string; email: string; password: string }) => {
    const { guardianId, ...body } = v;
    void studentId;
    return apiFetch<{ user: { id: string; email: string } }>(`/school/guardians/${guardianId}/account`, { method: 'POST', body });
  });

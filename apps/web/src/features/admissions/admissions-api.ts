import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Gender, GuardianRelation, StudentDetail } from '@/features/students/students-api';

export type AdmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export const ADMISSION_STATUSES: AdmissionStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export interface ApplicationRow {
  id: string; applicationNo: string; status: AdmissionStatus; firstName: string; lastName: string; gender: Gender;
  appliedClass: { id: string; name: string }; guardianName: string; guardianPhone: string; applicationDate: string;
}
export interface ApplicationDetail extends ApplicationRow {
  dateOfBirth: string; bloodGroup: string | null; previousSchool: string | null; address: string | null; notes: string | null;
  guardianEmail: string | null; guardianRelation: GuardianRelation; guardianOccupation: string | null;
  decidedAt: string | null; decidedBy: { id: string; name: string } | null; decisionNote: string | null;
  student: { id: string; admissionNo: string } | null; createdAt: string;
}
export interface ApplicationValues {
  firstName: string; lastName: string; gender: Gender; dateOfBirth: string; bloodGroup?: string; previousSchool?: string; address?: string; notes?: string;
  appliedClassId: string; guardianName: string; guardianPhone: string; guardianEmail?: string; guardianRelation: GuardianRelation; guardianOccupation?: string; applicationDate: string;
}

export const useApplications = (f: { status?: AdmissionStatus; classId?: string }) =>
  useQuery({
    queryKey: ['admissions', 'list', f],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: '2000' });
      for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
      return apiFetch<{ applications: ApplicationRow[]; total: number }>(`/admissions?${p}`);
    },
  });
export const useApplication = (id: string) => useQuery({ queryKey: ['admissions', 'one', id], queryFn: async () => (await apiFetch<{ application: ApplicationDetail }>(`/admissions/${id}`)).application });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['admissions'] }), qc.invalidateQueries({ queryKey: ['students'] }), qc.invalidateQueries({ queryKey: ['academics'] })]); },
  });
}
export const useCreateApplication = () => useRefreshing((v: ApplicationValues) => apiFetch<{ application: ApplicationDetail }>('/admissions', { method: 'POST', body: v }));
export const useApproveApplication = (id: string) =>
  useRefreshing((v: { classId?: string; sectionId?: string | null; admissionDate: string; admissionNo?: string }) =>
    apiFetch<{ application: ApplicationDetail; student: StudentDetail }>(`/admissions/${id}/approve`, { method: 'POST', body: v }));
export const useRejectApplication = (id: string) => useRefreshing((note: string) => apiFetch<{ application: ApplicationDetail }>(`/admissions/${id}/reject`, { method: 'POST', body: { note } }));

export interface PortalChild {
  id: string; admissionNo: string; firstName: string; lastName: string; status: string;
  class: { id: string; name: string }; section: { id: string; name: string } | null; relation: string;
}
export const usePortalChildren = () => useQuery({ queryKey: ['portal', 'children'], queryFn: () => apiFetch<{ viewer: 'PARENT' | 'STUDENT'; guardianName: string | null; children: PortalChild[] }>('/portal/children') });

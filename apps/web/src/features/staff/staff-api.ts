import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Gender } from '@/features/students/students-api';

export type StaffCategory = 'TEACHING' | 'ADMINISTRATIVE' | 'SUPPORT';
export type StaffStatus = 'ACTIVE' | 'LEFT';
export const CATEGORIES: StaffCategory[] = ['TEACHING', 'ADMINISTRATIVE', 'SUPPORT'];
export const STAFF_STATUSES: StaffStatus[] = ['ACTIVE', 'LEFT'];

export interface StaffRow {
  id: string; employeeNo: string; firstName: string; lastName: string; gender: Gender; category: StaffCategory; designation: string;
  phone: string; status: StaffStatus; hasAccount: boolean;
}
export interface StaffDetail extends StaffRow {
  email: string | null; cnic: string | null; address: string | null; dateOfBirth: string | null; qualification: string | null;
  joiningDate: string; leftAt: string | null; leftReason: string | null; notes: string | null; createdAt: string;
  account: { id: string; email: string; role: string } | null;
}
export interface StaffValues {
  employeeNo?: string; firstName: string; lastName: string; gender: Gender; dateOfBirth?: string | null; phone: string; email?: string; cnic?: string;
  address?: string; category: StaffCategory; designation: string; qualification?: string; joiningDate: string; notes?: string;
}

export const useStaffList = (f: { category?: StaffCategory; status?: StaffStatus }) =>
  useQuery({
    queryKey: ['staff', 'list', f],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: '2000' });
      for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
      return apiFetch<{ staff: StaffRow[]; total: number }>(`/staff?${p}`);
    },
  });
export const useStaffMember = (id: string) => useQuery({ queryKey: ['staff', 'one', id], queryFn: async () => (await apiFetch<{ staff: StaffDetail }>(`/staff/${id}`)).staff });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // A staff login is also a school user, so the Users & roles list must refresh too.
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['staff'] }), qc.invalidateQueries({ queryKey: ['school'] })]); },
  });
}

export const useCreateStaff = () => useRefreshing((v: StaffValues) => apiFetch<{ staff: StaffDetail }>('/staff', { method: 'POST', body: v }));
export const useUpdateStaff = (id: string) => useRefreshing((v: Partial<StaffValues>) => apiFetch<{ staff: StaffDetail }>(`/staff/${id}`, { method: 'PATCH', body: v }));
export const useLeaveStaff = (id: string) => useRefreshing((v: { date: string; reason?: string }) => apiFetch<{ staff: StaffDetail }>(`/staff/${id}/leave`, { method: 'POST', body: v }));
export const useReinstateStaff = (id: string) => useRefreshing(() => apiFetch<{ staff: StaffDetail }>(`/staff/${id}/reinstate`, { method: 'POST' }));
export const useDeleteStaff = (id: string) => useRefreshing(() => apiFetch<void>(`/staff/${id}`, { method: 'DELETE' }));
export const useCreateStaffAccount = (id: string) =>
  useRefreshing((v: { email: string; password: string; roleId: string }) => apiFetch<{ user: { id: string; email: string } }>(`/school/staff/${id}/account`, { method: 'POST', body: v }));

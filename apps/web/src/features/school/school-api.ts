import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';
export interface AuditEntry { id: string; action: string; createdAt: string; ip: string | null; metadata: unknown; user: { id: string; email: string } | null }
export interface Overview {
  school: { id: string; name: string; code: string; status: 'ACTIVE' | 'SUSPENDED'; city: string | null };
  subscription: { planName: string; status: string; endsAt: string | null } | null;
  currentSession: { id: string; name: string; startDate: string; endDate: string } | null;
  counts: { users: number; activeUsers: number; classes: number; sections: number; subjects: number };
  usersByRole: { roleKey: string; roleName: string; count: number }[];
  logins7d: number; failedLogins7d: number;
  recentActivity: AuditEntry[];
}
export interface Profile { id: string; name: string; code: string; email: string | null; phone: string | null; address: string | null; city: string | null; country: string; timezone: string }
export interface SchoolUser {
  id: string; email: string; firstName: string; lastName: string; phone: string | null; status: UserStatus;
  role: { id: string; key: string; name: string }; lastLoginAt: string | null; createdAt: string;
}
export interface RoleOption { id: string; key: string; name: string }

const q = {
  overview: ['school', 'overview'] as const,
  profile: ['school', 'profile'] as const,
  users: ['school', 'users'] as const,
  roles: ['school', 'roles'] as const,
  logs: (f: object) => ['school', 'logs', f] as const,
};

export const useOverview = () => useQuery({ queryKey: q.overview, queryFn: async () => (await apiFetch<{ overview: Overview }>('/school/overview')).overview });
export const useProfile = () => useQuery({ queryKey: q.profile, queryFn: async () => (await apiFetch<{ profile: Profile }>('/school/profile')).profile });
export const useSchoolUsers = () => useQuery({ queryKey: q.users, queryFn: async () => (await apiFetch<{ users: SchoolUser[] }>('/school/users')).users });
export const useRoleOptions = () => useQuery({ queryKey: q.roles, queryFn: async () => (await apiFetch<{ roles: RoleOption[] }>('/roles')).roles });
export const useSchoolLogs = (filter: { action?: string; limit?: number }) =>
  useQuery({
    queryKey: q.logs(filter),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filter.action) p.set('action', filter.action);
      p.set('limit', String(filter.limit ?? 200));
      return (await apiFetch<{ logs: AuditEntry[] }>(`/school/audit-logs?${p}`)).logs;
    },
  });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['school'] }) });
}
export const useUpdateProfile = () =>
  useRefreshing((v: Partial<Pick<Profile, 'name' | 'email' | 'phone' | 'address' | 'city' | 'timezone'>>) => apiFetch<{ profile: Profile }>('/school/profile', { method: 'PATCH', body: v }));
export const useCreateUser = () =>
  useRefreshing((v: { firstName: string; lastName: string; email: string; phone?: string | null; roleId: string; password: string }) =>
    apiFetch<{ user: SchoolUser }>('/school/users', { method: 'POST', body: v }));
export const useUpdateUser = () =>
  useRefreshing((v: { id: string; firstName: string; lastName: string; phone: string | null; roleId?: string }) => {
    const { id, ...body } = v;
    return apiFetch<{ user: SchoolUser }>(`/school/users/${id}`, { method: 'PATCH', body });
  });
export const useSetUserStatus = () =>
  useRefreshing((v: { id: string; status: 'ACTIVE' | 'INACTIVE' }) => apiFetch<{ user: SchoolUser }>(`/school/users/${v.id}/status`, { method: 'POST', body: { status: v.status } }));

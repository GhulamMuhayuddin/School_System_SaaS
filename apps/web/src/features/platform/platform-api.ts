import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type SchoolStatus = 'ACTIVE' | 'SUSPENDED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'];

export interface Subscription { id: string; planId: string; planName: string; status: SubscriptionStatus; startsAt: string; endsAt: string | null }
export interface SchoolListItem {
  id: string; name: string; code: string; status: SchoolStatus; email: string | null; city: string | null;
  createdAt: string; userCount: number; subscription: Subscription | null;
}
export interface SchoolDetail extends SchoolListItem {
  phone: string | null; address: string | null; country: string; timezone: string;
  counts: { users: number; classes: number; sections: number; subjects: number };
  admins: { id: string; email: string; firstName: string; lastName: string; status: string; lastLoginAt: string | null }[];
  subscriptions: Subscription[];
}
export interface Plan { id: string; name: string; priceMonthly: number; maxStudents: number | null; maxStaff: number | null; isActive: boolean; schoolCount: number }
export interface PlatformAdmin { id: string; email: string; firstName: string; lastName: string; status: 'ACTIVE' | 'INACTIVE' | 'LOCKED'; lastLoginAt: string | null; createdAt: string }
export interface AuditLog {
  id: string; action: string; createdAt: string; ip: string | null; metadata: unknown;
  user: { id: string; email: string } | null; school: { id: string; name: string } | null;
}
export interface Analytics {
  schools: { total: number; active: number; suspended: number };
  users: { schoolUsers: number; platformAdmins: number };
  subscriptions: Record<SubscriptionStatus | 'NONE', number>;
  newSchoolsByMonth: { month: string; count: number }[];
  logins7d: number; failedLogins7d: number;
}

export interface CreateSchoolValues {
  name: string; code: string; email?: string; phone?: string; city?: string; address?: string; timezone?: string; planId: string;
  admin: { firstName: string; lastName: string; email: string; password: string };
}

const key = {
  analytics: ['platform', 'analytics'] as const,
  schools: ['platform', 'schools'] as const,
  school: (id: string) => ['platform', 'school', id] as const,
  plans: ['platform', 'plans'] as const,
  admins: ['platform', 'admins'] as const,
  logs: (f: object) => ['platform', 'logs', f] as const,
};

export const useAnalytics = () => useQuery({ queryKey: key.analytics, queryFn: async () => (await apiFetch<{ analytics: Analytics }>('/platform/analytics')).analytics });
export const useSchools = () => useQuery({ queryKey: key.schools, queryFn: async () => (await apiFetch<{ schools: SchoolListItem[] }>('/platform/schools')).schools });
export const useSchool = (id: string) => useQuery({ queryKey: key.school(id), queryFn: async () => (await apiFetch<{ school: SchoolDetail }>(`/platform/schools/${id}`)).school });
export const usePlans = () => useQuery({ queryKey: key.plans, queryFn: async () => (await apiFetch<{ plans: Plan[] }>('/platform/plans')).plans });
export const usePlatformAdmins = () => useQuery({ queryKey: key.admins, queryFn: async () => (await apiFetch<{ admins: PlatformAdmin[] }>('/platform/admins')).admins });
export const useAuditLogs = (filter: { schoolId?: string; action?: string; limit?: number }) =>
  useQuery({
    queryKey: key.logs(filter),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filter.schoolId) p.set('schoolId', filter.schoolId);
      if (filter.action) p.set('action', filter.action);
      p.set('limit', String(filter.limit ?? 200));
      return (await apiFetch<{ logs: AuditLog[] }>(`/platform/audit-logs?${p}`)).logs;
    },
  });

/** Everything a Super Admin changes can alter lists, details, counts and the log, so mutations refresh all platform data. */
function useInvalidatingMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['platform'] }) });
}

export const useCreateSchool = () =>
  useInvalidatingMutation((v: CreateSchoolValues) => apiFetch<{ school: SchoolDetail }>('/platform/schools', { method: 'POST', body: v }));
export const useUpdateSchool = (id: string) =>
  useInvalidatingMutation((v: Partial<Pick<CreateSchoolValues, 'name' | 'email' | 'phone' | 'city' | 'address' | 'timezone'>>) =>
    apiFetch<{ school: SchoolDetail }>(`/platform/schools/${id}`, { method: 'PATCH', body: v }));
export const useSetSchoolStatus = (id: string) =>
  useInvalidatingMutation((status: SchoolStatus) => apiFetch<{ school: SchoolDetail }>(`/platform/schools/${id}/status`, { method: 'POST', body: { status } }));
export const useSetSubscription = (id: string) =>
  useInvalidatingMutation((v: { planId: string; status: SubscriptionStatus; endsAt?: string | null }) =>
    apiFetch<{ school: SchoolDetail }>(`/platform/schools/${id}/subscription`, { method: 'PUT', body: v }));
export const useSavePlan = () =>
  useInvalidatingMutation((v: { id?: string; name: string; priceMonthly: number; maxStudents: number | null; maxStaff: number | null; isActive: boolean }) => {
    const { id, ...body } = v;
    return id
      ? apiFetch<{ plan: Plan }>(`/platform/plans/${id}`, { method: 'PATCH', body })
      : apiFetch<{ plan: Plan }>('/platform/plans', { method: 'POST', body });
  });
export const useCreatePlatformAdmin = () =>
  useInvalidatingMutation((v: { firstName: string; lastName: string; email: string; password: string }) =>
    apiFetch<{ admin: PlatformAdmin }>('/platform/admins', { method: 'POST', body: v }));
export const useSetPlatformAdminStatus = () =>
  useInvalidatingMutation((v: { id: string; status: 'ACTIVE' | 'INACTIVE' }) =>
    apiFetch<{ admin: PlatformAdmin }>(`/platform/admins/${v.id}/status`, { method: 'POST', body: { status: v.status } }));

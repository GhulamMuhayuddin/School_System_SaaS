import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { CalendarEventDto } from '@/features/academics/planning-api';
import type { SectionTimetable } from '@/features/academics/academics-api';
import type { StudentHistory } from '@/features/attendance/attendance-api';
import type { ExamDto, StudentResult } from '@/features/exams/exams-api';
import type { StudentLibrary } from '@/features/library/library-api';
import type { StudentHostel } from '@/features/hostel/hostel-api';
import type { StudentTransport } from '@/features/transport/transport-api';
import type { Voucher, VoucherDetail } from '@/features/fees/fees-api';

export type PortalViewer = 'PARENT' | 'STUDENT';
export interface PortalChild {
  id: string; admissionNo: string; firstName: string; lastName: string; status: string;
  class: { id: string; name: string }; section: { id: string; name: string } | null; relation: string;
}
export interface PortalChildren { viewer: PortalViewer; guardianName: string | null; children: PortalChild[] }
export interface PortalFees { vouchers: Voucher[]; totals: { billed: number; paid: number; balance: number; overdueBalance: number } }
export interface PortalResult { exam: ExamDto; class: { id: string; name: string }; classSize: number; result: StudentResult }
export type PortalAttendance = StudentHistory & { month: string };

export const PORTAL_TABS = ['attendance', 'results', 'fees', 'homework', 'library', 'transport', 'hostel', 'timetable', 'calendar'] as const;
export type PortalTab = (typeof PORTAL_TABS)[number];

export const monthText = (d: Date = new Date()): string => d.toISOString().slice(0, 7);
export const shiftMonth = (month: string, by: number): string => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
export const monthBounds = (month: string): { from: string; to: string } => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { from: `${month}-01`, to: `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}` };
};

export const usePortalChildren = () => useQuery({ queryKey: ['portal', 'children'], queryFn: () => apiFetch<PortalChildren>('/portal/children') });
export const usePortalAttendance = (id: string, month: string) =>
  useQuery({ queryKey: ['portal', 'attendance', id, month], queryFn: () => apiFetch<PortalAttendance>(`/portal/children/${id}/attendance?month=${month}`) });
export const usePortalResults = (id: string) => useQuery({ queryKey: ['portal', 'results', id], queryFn: () => apiFetch<PortalResult[]>(`/portal/children/${id}/results`) });
export const usePortalFees = (id: string) => useQuery({ queryKey: ['portal', 'fees', id], queryFn: () => apiFetch<PortalFees>(`/portal/children/${id}/fees`) });
export const usePortalVoucher = (id: string, voucherId: string | null) =>
  useQuery({ queryKey: ['portal', 'voucher', id, voucherId], enabled: Boolean(voucherId), queryFn: () => apiFetch<VoucherDetail>(`/portal/children/${id}/fees/${voucherId}`) });
export const usePortalTimetable = (id: string) =>
  useQuery({ queryKey: ['portal', 'timetable', id], queryFn: async () => (await apiFetch<{ timetable: SectionTimetable | null }>(`/portal/children/${id}/timetable`)).timetable });
export const usePortalCalendar = (from: string, to: string) =>
  useQuery({ queryKey: ['portal', 'calendar', from, to], queryFn: async () => (await apiFetch<{ events: CalendarEventDto[] }>(`/portal/calendar?from=${from}&to=${to}`)).events });
export const usePortalHostel = (id: string) => useQuery({ queryKey: ['portal', 'hostel', id], queryFn: () => apiFetch<StudentHostel>(`/portal/children/${id}/hostel`) });
export const usePortalTransport = (id: string) => useQuery({ queryKey: ['portal', 'transport', id], queryFn: () => apiFetch<StudentTransport>(`/portal/children/${id}/transport`) });
export const usePortalLibrary = (id: string) => useQuery({ queryKey: ['portal', 'library', id], queryFn: () => apiFetch<StudentLibrary>(`/portal/children/${id}/library`) });

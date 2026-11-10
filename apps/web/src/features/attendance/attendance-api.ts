import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'LEAVE'];
export type BlockReason = 'FUTURE_DATE' | 'HOLIDAY' | 'NOT_YOUR_SECTION' | 'PAST_DATE' | 'NO_SESSION';

export interface Totals { present: number; absent: number; late: number; leave: number; marked: number; percentage: number | null }
export interface SectionRef { id: string; name: string; classId: string; className: string }
export interface RosterStudent { id: string; admissionNo: string; name: string; status: AttendanceStatus | null; remark: string | null }
export interface SectionRoster {
  date: string; today: string; section: SectionRef; holiday: { title: string } | null; marked: boolean;
  access: { canMark: boolean; reason: BlockReason | null }; students: RosterStudent[];
}
export interface MonthlyStudent { id: string; admissionNo: string; name: string; records: Record<string, AttendanceStatus>; totals: Totals }
export interface MonthlySheet { month: string; days: number; holidays: string[]; section: SectionRef; students: MonthlyStudent[] }
export interface ReportRow { student: { id: string; admissionNo: string; name: string; className: string | null; sectionName: string | null }; totals: Totals }
export interface ReportDto { from: string; to: string; total: number; rows: ReportRow[] }
export interface StaffRosterRow { id: string; employeeNo: string; name: string; designation: string; status: AttendanceStatus | null; remark: string | null }
export interface StaffRoster { date: string; today: string; holiday: { title: string } | null; marked: boolean; staff: StaffRosterRow[] }
export interface MonthlyStaff { id: string; employeeNo: string; name: string; records: Record<string, AttendanceStatus>; totals: Totals }
export interface StaffMonthlySheet { month: string; days: number; holidays: string[]; staff: MonthlyStaff[] }
export interface Entry { id: string; status: AttendanceStatus; remark?: string | null }

export const useSectionRoster = (sectionId: string | undefined, date: string) =>
  useQuery({
    queryKey: ['attendance', 'roster', sectionId, date], enabled: Boolean(sectionId),
    queryFn: () => apiFetch<SectionRoster>(`/attendance/students/sections/${sectionId}${date ? `?date=${date}` : ''}`),
  });
export const useSectionMonthly = (sectionId: string | undefined, month: string) =>
  useQuery({ queryKey: ['attendance', 'monthly', sectionId, month], enabled: Boolean(sectionId && month), queryFn: () => apiFetch<MonthlySheet>(`/attendance/students/sections/${sectionId}/monthly?month=${month}`) });
export const useAttendanceReport = (f: { from: string; to: string; classId?: string; sectionId?: string; below?: number }) =>
  useQuery({
    queryKey: ['attendance', 'report', f], enabled: Boolean(f.from && f.to && f.to >= f.from),
    queryFn: () => {
      const p = new URLSearchParams({ from: f.from, to: f.to, limit: '500' });
      if (f.classId) p.set('classId', f.classId);
      if (f.sectionId) p.set('sectionId', f.sectionId);
      if (f.below) p.set('below', String(f.below));
      return apiFetch<ReportDto>(`/attendance/reports/students?${p}`);
    },
  });
export interface StudentHistory { student: { id: string; admissionNo: string; name: string }; from: string; to: string; records: { date: string; status: AttendanceStatus; remark: string | null }[]; totals: Totals }
export const useStudentHistory = (studentId: string, from: string, to: string, enabled = true) =>
  useQuery({ queryKey: ['attendance', 'history', studentId, from, to], enabled, queryFn: () => apiFetch<StudentHistory>(`/attendance/students/${studentId}/history?from=${from}&to=${to}`) });
export const useStaffRoster = (date: string, enabled = true) =>
  useQuery({ queryKey: ['attendance', 'staff-roster', date], enabled, queryFn: () => apiFetch<StaffRoster>(`/attendance/staff${date ? `?date=${date}` : ''}`) });
export const useStaffMonthly = (month: string, enabled = true) =>
  useQuery({ queryKey: ['attendance', 'staff-monthly', month], enabled: enabled && Boolean(month), queryFn: () => apiFetch<StaffMonthlySheet>(`/attendance/staff/monthly?month=${month}`) });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }) });
}
export const useMarkStudents = (sectionId: string) =>
  useRefreshing((v: { date: string; entries: Entry[] }) =>
    apiFetch<SectionRoster>(`/attendance/students/sections/${sectionId}`, { method: 'PUT', body: { date: v.date, entries: v.entries.map((e) => ({ studentId: e.id, status: e.status, remark: e.remark ?? null })) } }));
export const useMarkStaff = () =>
  useRefreshing((v: { date: string; entries: Entry[] }) =>
    apiFetch<StaffRoster>('/attendance/staff', { method: 'PUT', body: { date: v.date, entries: v.entries.map((e) => ({ staffId: e.id, status: e.status, remark: e.remark ?? null })) } }));

/** Counts of each status in a draft, for the live summary above the roster. */
export function tally(statuses: (AttendanceStatus | null)[]): Record<AttendanceStatus | 'UNMARKED', number> {
  const out = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, UNMARKED: 0 };
  for (const s of statuses) out[s ?? 'UNMARKED'] += 1;
  return out;
}
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const pad = (n: number) => String(n).padStart(2, '0');
/** 'YYYY-MM' + day number -> 'YYYY-MM-DD'. */
export const dayKey = (month: string, d: number) => `${month}-${pad(d)}`;

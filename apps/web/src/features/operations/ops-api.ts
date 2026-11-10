import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// ---- visitors ------------------------------------------------------------------------------------------------------
export interface Visit {
  id: string; visitNo: string; name: string; phone: string | null; purpose: string; visiting: string | null; student: { id: string; name: string; admissionNo: string } | null;
  notes: string | null; checkInAt: string; checkOutAt: string | null; minutes: number | null; inside: boolean;
}
export interface VisitValues { name: string; phone: string | null; purpose: string; visiting: string | null; notes: string | null }
export interface VisitSummary { today: number; inside: number }

/** "45 min" / "1 h 05 min"; empty while the visitor is still inside. */
export function durationText(minutes: number | null): string {
  if (minutes === null) return '';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
/** Digits, spaces, + - ( ) only (same rule as the server); blank is fine. */
export const phoneOk = (v: string): boolean => /^[0-9+\-\s()]*$/.test(v) && v.length <= 30;
export const timeOf = (iso: string, lang: string): string => new Date(iso).toLocaleTimeString(lang === 'ur' ? 'ur-PK' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

const qs = (o: Record<string, string | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useVisitSummary = () => useQuery({ queryKey: ['visitors', 'summary'], queryFn: () => apiFetch<VisitSummary>('/visitors/summary') });
export const useVisits = (f: { date?: string; inside?: boolean; q?: string }) =>
  useQuery({ queryKey: ['visitors', 'list', f], queryFn: () => apiFetch<{ visits: Visit[]; truncated: boolean }>(`/visitors/visits${qs({ ...f })}`) });
function useVisitMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['visitors'] }) });
}
export const useCheckIn = () => useVisitMutation((v: VisitValues) => apiFetch<Visit>('/visitors/visits', { method: 'POST', body: v }));
export const useCheckOut = () => useVisitMutation((id: string) => apiFetch<Visit>(`/visitors/visits/${id}/checkout`, { method: 'POST' }));
export const useUpdateVisit = () => useVisitMutation((v: { id: string; patch: Partial<VisitValues> }) => apiFetch<Visit>(`/visitors/visits/${v.id}`, { method: 'PATCH', body: v.patch }));

// ---- complaints ----------------------------------------------------------------------------------------------------
export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type ComplaintSource = 'PARENT' | 'STUDENT' | 'STAFF' | 'OTHER';
export type ComplaintCategory = 'ACADEMIC' | 'DISCIPLINE' | 'FEES' | 'TRANSPORT' | 'FACILITIES' | 'STAFF' | 'OTHER';
export type ComplaintPriority = 'LOW' | 'NORMAL' | 'HIGH';
export const COMPLAINT_STATUSES: ComplaintStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const SOURCES: ComplaintSource[] = ['PARENT', 'STUDENT', 'STAFF', 'OTHER'];
export const CATEGORIES: ComplaintCategory[] = ['ACADEMIC', 'DISCIPLINE', 'FEES', 'TRANSPORT', 'FACILITIES', 'STAFF', 'OTHER'];
export const PRIORITIES: ComplaintPriority[] = ['LOW', 'NORMAL', 'HIGH'];
export interface Complaint {
  id: string; complaintNo: string; source: ComplaintSource; name: string; phone: string | null; student: { id: string; name: string; admissionNo: string } | null;
  category: ComplaintCategory; subject: string; details: string; priority: ComplaintPriority; status: ComplaintStatus; assignedTo: { id: string; name: string } | null;
  resolution: string | null; resolvedAt: string | null; createdAt: string;
}
export interface Note { id: string; kind: 'NOTE' | 'STATUS' | 'ASSIGN'; text: string; by: string | null; createdAt: string }
export interface ComplaintDetail { complaint: Complaint; notes: Note[] }
export interface ComplaintSummary { open: number; inProgress: number; highActive: number; resolved: number }
export interface ComplaintValues { source: ComplaintSource; name: string; phone: string | null; category: ComplaintCategory; subject: string; details: string; priority: ComplaintPriority }

/** Same transitions as the server. */
const NEXT: Record<ComplaintStatus, ComplaintStatus[]> = { OPEN: ['IN_PROGRESS', 'RESOLVED'], IN_PROGRESS: ['OPEN', 'RESOLVED'], RESOLVED: ['CLOSED', 'OPEN'], CLOSED: ['OPEN'] };
export const nextStatuses = (s: ComplaintStatus): ComplaintStatus[] => NEXT[s];
export const resolutionOk = (t: string): boolean => t.trim().length >= 3;
export const priorityTone = (p: ComplaintPriority): 'danger' | 'neutral' | 'brand' => (p === 'HIGH' ? 'danger' : p === 'LOW' ? 'neutral' : 'brand');
export const statusTone = (s: ComplaintStatus): 'warning' | 'brand' | 'success' | 'neutral' => (s === 'OPEN' ? 'warning' : s === 'IN_PROGRESS' ? 'brand' : s === 'RESOLVED' ? 'success' : 'neutral');
/** Whole days since the complaint was logged (never negative). */
export const ageDays = (iso: string, now: Date = new Date()): number => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000));

export const useComplaintSummary = () => useQuery({ queryKey: ['complaints', 'summary'], queryFn: () => apiFetch<ComplaintSummary>('/complaints/summary') });
export const useComplaints = (f: { status?: ComplaintStatus; category?: ComplaintCategory; priority?: ComplaintPriority; active?: boolean; q?: string }) =>
  useQuery({ queryKey: ['complaints', 'list', f], queryFn: () => apiFetch<{ complaints: Complaint[]; truncated: boolean }>(`/complaints${qs({ ...f })}`) });
export const useComplaint = (id: string) => useQuery({ queryKey: ['complaints', 'one', id], queryFn: () => apiFetch<ComplaintDetail>(`/complaints/${id}`) });
function useComplaintMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['complaints'] }) });
}
export const useCreateComplaint = () => useComplaintMutation((v: ComplaintValues) => apiFetch<ComplaintDetail>('/complaints', { method: 'POST', body: v }));
export const useUpdateComplaint = () => useComplaintMutation((v: { id: string; patch: Partial<Omit<ComplaintValues, 'source'>> }) => apiFetch<ComplaintDetail>(`/complaints/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useAssignComplaint = () => useComplaintMutation((v: { id: string; staffId: string | null }) => apiFetch<ComplaintDetail>(`/complaints/${v.id}/assign`, { method: 'POST', body: { staffId: v.staffId } }));
export const useSetComplaintStatus = () => useComplaintMutation((v: { id: string; status: ComplaintStatus; resolution: string | null }) => apiFetch<ComplaintDetail>(`/complaints/${v.id}/status`, { method: 'POST', body: { status: v.status, resolution: v.resolution } }));
export const useAddNote = () => useComplaintMutation((v: { id: string; text: string }) => apiFetch<ComplaintDetail>(`/complaints/${v.id}/notes`, { method: 'POST', body: { text: v.text } }));

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type HostelKind = 'BOYS' | 'GIRLS' | 'MIXED';
export type BedState = 'FREE' | 'FULL' | 'OVER';
export const HOSTEL_KINDS: HostelKind[] = ['BOYS', 'GIRLS', 'MIXED'];
export interface Hostel {
  id: string; name: string; kind: HostelKind; wardenName: string | null; wardenPhone: string | null; notes: string | null; active: boolean;
  rooms: number; beds: number; residents: number; income: number;
}
export interface Room {
  id: string; hostelId: string; hostelName: string; hostelKind: HostelKind; roomNo: string; floor: number | null; beds: number; monthlyFee: number; notes: string | null; active: boolean;
  residents: number; bedState: BedState; income: number;
}
export interface Resident { student: { id: string; name: string; admissionNo: string; className: string | null }; hostel: { id: string; name: string }; room: { id: string; roomNo: string }; assignedOn: string }
export interface Allocation {
  hostel: { id: string; name: string; kind: HostelKind; wardenName: string | null; wardenPhone: string | null };
  room: { id: string; roomNo: string; floor: number | null; monthlyFee: number }; assignedOn: string;
}
export interface StudentHostel { allocation: Allocation | null }
export interface HostelSummary { hostels: number; rooms: number; beds: number; residents: number; freeBeds: number; monthlyIncome: number; overCapacity: number }
export interface HostelValues { name: string; kind: HostelKind; wardenName: string | null; wardenPhone: string | null; notes: string | null }
export interface RoomValues { roomNo: string; floor: number | null; beds: number; monthlyFee: number; notes: string | null }

export const bedTone = (s: BedState): 'success' | 'warning' | 'danger' => (s === 'FREE' ? 'success' : s === 'FULL' ? 'warning' : 'danger');
/** Whole number of beds from 1 to 40; null when the text is not such a number. */
export function parseBeds(text: string): number | null {
  const v = text.trim();
  return /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 40 ? Number(v) : null;
}
/** Floor: blank means "not given" (returns undefined); a whole number from -2 to 50 is returned; anything else is null. */
export function parseFloorNo(text: string): number | null | undefined {
  const v = text.trim();
  if (v === '') return undefined;
  return /^-?\d{1,2}$/.test(v) && Number(v) >= -2 && Number(v) <= 50 ? Number(v) : null;
}
/** Free beds of a room (never below 0). */
export const freeBeds = (r: Pick<Room, 'beds' | 'residents'>): number => Math.max(0, r.beds - r.residents);
/** Can this gender live in a hostel of this kind? (same rule as the server) */
export const genderFits = (kind: HostelKind, gender: 'MALE' | 'FEMALE' | 'OTHER'): boolean => kind === 'MIXED' || (kind === 'BOYS' ? gender === 'MALE' : gender === 'FEMALE');

const qs = (o: Record<string, string | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useHostelSummary = () => useQuery({ queryKey: ['hostel', 'summary'], queryFn: () => apiFetch<HostelSummary>('/hostel/summary') });
export const useHostels = (includeInactive = false) => useQuery({ queryKey: ['hostel', 'hostels', includeInactive], queryFn: () => apiFetch<Hostel[]>(`/hostel/hostels${qs({ includeInactive })}`) });
export const useRooms = (f: { hostelId?: string; includeInactive?: boolean } = {}) => useQuery({ queryKey: ['hostel', 'rooms', f], queryFn: () => apiFetch<Room[]>(`/hostel/rooms${qs({ ...f })}`) });
export const useResidents = (f: { hostelId?: string }) => useQuery({ queryKey: ['hostel', 'residents', f], queryFn: () => apiFetch<{ residents: Resident[]; truncated: boolean }>(`/hostel/residents${qs({ ...f })}`) });
export const useStudentHostel = (studentId: string) => useQuery({ queryKey: ['hostel', 'student', studentId], queryFn: () => apiFetch<StudentHostel>(`/hostel/students/${studentId}`) });

/** Hostels, rooms, beds and residents all depend on each other, so any change refreshes everything hostel. */
function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['hostel'] }) });
}
export const useCreateHostel = () => useRefreshing((v: HostelValues) => apiFetch<Hostel>('/hostel/hostels', { method: 'POST', body: v }));
export const useUpdateHostel = () => useRefreshing((v: { id: string; patch: Partial<HostelValues> & { active?: boolean } }) => apiFetch<Hostel>(`/hostel/hostels/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useCreateRoom = () => useRefreshing((v: RoomValues & { hostelId: string }) => apiFetch<Room>('/hostel/rooms', { method: 'POST', body: v }));
export const useUpdateRoom = () => useRefreshing((v: { id: string; patch: Partial<RoomValues> & { active?: boolean } }) => apiFetch<Room>(`/hostel/rooms/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useAssignRoom = () => useRefreshing((v: { studentId: string; roomId: string }) => apiFetch<Allocation>(`/hostel/students/${v.studentId}`, { method: 'PUT', body: { roomId: v.roomId } }));
export const useRemoveResident = () => useRefreshing((studentId: string) => apiFetch<void>(`/hostel/students/${studentId}`, { method: 'DELETE' }));

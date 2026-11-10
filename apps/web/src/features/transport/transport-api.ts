import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type SeatState = 'NO_VEHICLE' | 'FREE' | 'FULL' | 'OVER';
export interface Vehicle {
  id: string; registrationNo: string; kind: string; capacity: number; driverName: string | null; driverPhone: string | null; notes: string | null; active: boolean;
  routes: { id: string; name: string }[]; riders: number;
}
export interface Stop { id: string; name: string; sequence: number; pickupTime: string | null; riders: number }
export interface Route {
  id: string; name: string; monthlyFee: number; notes: string | null; active: boolean; riders: number; seat: SeatState; income: number;
  vehicle: { id: string; registrationNo: string; capacity: number; driverName: string | null; driverPhone: string | null } | null; stops: Stop[];
}
export interface Rider { student: { id: string; name: string; admissionNo: string; className: string | null }; route: { id: string; name: string }; stop: { id: string; name: string }; assignedOn: string }
export interface Assignment {
  route: { id: string; name: string; monthlyFee: number }; stop: { id: string; name: string; pickupTime: string | null };
  vehicle: { registrationNo: string; kind: string; driverName: string | null; driverPhone: string | null } | null; assignedOn: string;
}
export interface StudentTransport { assignment: Assignment | null }
export interface TransportSummary { routes: number; vehicles: number; riders: number; monthlyIncome: number; routesWithoutVehicle: number; overCapacity: number }
export interface StopValue { id?: string; name: string; pickupTime: string | null }
export interface VehicleValues { registrationNo: string; kind: string; capacity: number; driverName: string | null; driverPhone: string | null; notes: string | null }

/** "07:05" style 24 hour time (same rule as the server). */
export const validTime = (t: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
/** 1-based position of the first stop whose pickup time goes backwards, or null. */
export function firstOutOfOrder(times: (string | null)[]): number | null {
  let last = '';
  for (const [i, t] of times.entries()) {
    if (!t) continue;
    if (last && t < last) return i + 1;
    last = t;
  }
  return null;
}
/** Whole rupees between 0 and 1,000,000 (blank means 0); null when the text is not such a number. */
export function parseFee(text: string): number | null {
  const v = text.trim().replace(/,/g, '');
  if (v === '') return 0;
  return /^\d{1,7}$/.test(v) && Number(v) <= 1_000_000 ? Number(v) : null;
}
export const seatTone = (s: SeatState): 'success' | 'warning' | 'danger' | 'neutral' => (s === 'FREE' ? 'success' : s === 'FULL' ? 'warning' : s === 'OVER' ? 'danger' : 'neutral');

const qs = (o: Record<string, string | boolean | undefined>): string => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useTransportSummary = () => useQuery({ queryKey: ['transport', 'summary'], queryFn: () => apiFetch<TransportSummary>('/transport/summary') });
export const useVehicles = () => useQuery({ queryKey: ['transport', 'vehicles'], queryFn: () => apiFetch<Vehicle[]>('/transport/vehicles') });
export const useRoutes = (includeInactive = false) => useQuery({ queryKey: ['transport', 'routes', includeInactive], queryFn: () => apiFetch<Route[]>(`/transport/routes${qs({ includeInactive })}`) });
export const useRiders = (f: { routeId?: string }) => useQuery({ queryKey: ['transport', 'riders', f], queryFn: () => apiFetch<{ riders: Rider[]; truncated: boolean }>(`/transport/riders${qs({ ...f })}`) });
export const useStudentTransport = (studentId: string) => useQuery({ queryKey: ['transport', 'student', studentId], queryFn: () => apiFetch<StudentTransport>(`/transport/students/${studentId}`) });

/** Routes, vehicles, seats and riders all depend on each other, so any change refreshes everything transport. */
function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['transport'] }) });
}
export const useCreateRoute = () => useRefreshing((v: { name: string; monthlyFee: number; vehicleId: string | null; notes: string | null; stops: StopValue[] }) => apiFetch<Route>('/transport/routes', { method: 'POST', body: v }));
export const useUpdateRoute = () =>
  useRefreshing((v: { id: string; patch: { name?: string; monthlyFee?: number; vehicleId?: string | null; notes?: string | null; active?: boolean } }) => apiFetch<Route>(`/transport/routes/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useSetStops = () => useRefreshing((v: { id: string; stops: StopValue[] }) => apiFetch<Route>(`/transport/routes/${v.id}/stops`, { method: 'PUT', body: { stops: v.stops } }));
export const useCreateVehicle = () => useRefreshing((v: VehicleValues) => apiFetch<Vehicle>('/transport/vehicles', { method: 'POST', body: v }));
export const useUpdateVehicle = () => useRefreshing((v: { id: string; patch: Partial<VehicleValues> & { active?: boolean } }) => apiFetch<Vehicle>(`/transport/vehicles/${v.id}`, { method: 'PATCH', body: v.patch }));
export const useAssign = () => useRefreshing((v: { studentId: string; routeId: string; stopId: string }) => apiFetch<Assignment>(`/transport/students/${v.studentId}`, { method: 'PUT', body: { routeId: v.routeId, stopId: v.stopId } }));
export const useUnassign = () => useRefreshing((studentId: string) => apiFetch<void>(`/transport/students/${studentId}`, { method: 'DELETE' }));

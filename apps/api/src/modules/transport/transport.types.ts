import type { SeatState } from './transport.logic';

export type { SeatState };
export interface VehicleDto {
  id: string; registrationNo: string; kind: string; capacity: number; driverName: string | null; driverPhone: string | null; notes: string | null; active: boolean;
  routes: { id: string; name: string }[]; riders: number;
}
export interface VehicleInput { registrationNo: string; kind?: string; capacity: number; driverName?: string | null; driverPhone?: string | null; notes?: string | null }
export interface VehiclePatch { registrationNo?: string; kind?: string; capacity?: number; driverName?: string | null; driverPhone?: string | null; notes?: string | null; active?: boolean }
export interface StopDto { id: string; name: string; sequence: number; pickupTime: string | null; riders: number }
export interface RouteDto {
  id: string; name: string; monthlyFee: number; notes: string | null; active: boolean; riders: number; seat: SeatState; income: number;
  vehicle: { id: string; registrationNo: string; capacity: number; driverName: string | null; driverPhone: string | null } | null; stops: StopDto[];
}
export interface RouteInput { name: string; monthlyFee?: number; vehicleId?: string | null; notes?: string | null; stops?: StopInput[] }
export interface RoutePatch { name?: string; monthlyFee?: number; vehicleId?: string | null; notes?: string | null; active?: boolean }
export interface StopInput { id?: string; name: string; pickupTime?: string | null }
export interface RiderDto { student: { id: string; name: string; admissionNo: string; className: string | null }; route: { id: string; name: string }; stop: { id: string; name: string }; assignedOn: string }
export interface AssignmentDto { route: { id: string; name: string; monthlyFee: number }; stop: { id: string; name: string; pickupTime: string | null }; vehicle: { registrationNo: string; kind: string; driverName: string | null; driverPhone: string | null } | null; assignedOn: string }
export interface StudentTransport { assignment: AssignmentDto | null }
export interface TransportSummary { routes: number; vehicles: number; riders: number; monthlyIncome: number; routesWithoutVehicle: number; overCapacity: number }
export interface RiderFilter { routeId?: string; q?: string }

/** Every method receives the schoolId from the verified token (never from the request); `actorId` is the signed-in user. */
export interface TransportApi {
  summary(schoolId: string): Promise<TransportSummary>;
  listVehicles(schoolId: string): Promise<VehicleDto[]>;
  createVehicle(schoolId: string, actorId: string, input: VehicleInput): Promise<VehicleDto>;
  updateVehicle(schoolId: string, actorId: string, id: string, patch: VehiclePatch): Promise<VehicleDto>;
  listRoutes(schoolId: string, includeInactive: boolean): Promise<RouteDto[]>;
  createRoute(schoolId: string, actorId: string, input: RouteInput): Promise<RouteDto>;
  getRoute(schoolId: string, id: string): Promise<RouteDto>;
  updateRoute(schoolId: string, actorId: string, id: string, patch: RoutePatch): Promise<RouteDto>;
  setStops(schoolId: string, actorId: string, id: string, stops: StopInput[]): Promise<RouteDto>;
  listRiders(schoolId: string, filter: RiderFilter): Promise<{ riders: RiderDto[]; truncated: boolean }>;
  assign(schoolId: string, actorId: string, studentId: string, routeId: string, stopId: string): Promise<AssignmentDto>;
  unassign(schoolId: string, actorId: string, studentId: string): Promise<void>;
  /** For the student page and the parent/student portal (the portal checks ownership first). */
  studentTransport(schoolId: string, studentId: string): Promise<StudentTransport>;
}

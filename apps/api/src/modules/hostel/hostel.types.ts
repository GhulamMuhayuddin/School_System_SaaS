import type { BedState, GenderValue, HostelKindValue } from './hostel.logic';

export type { BedState, GenderValue, HostelKindValue };
export interface HostelDto {
  id: string; name: string; kind: HostelKindValue; wardenName: string | null; wardenPhone: string | null; notes: string | null; active: boolean;
  rooms: number; beds: number; residents: number; income: number;
}
export interface HostelInput { name: string; kind: HostelKindValue; wardenName?: string | null; wardenPhone?: string | null; notes?: string | null }
export interface HostelPatch { name?: string; kind?: HostelKindValue; wardenName?: string | null; wardenPhone?: string | null; notes?: string | null; active?: boolean }
export interface RoomDto {
  id: string; hostelId: string; hostelName: string; hostelKind: HostelKindValue; roomNo: string; floor: number | null; beds: number; monthlyFee: number; notes: string | null; active: boolean;
  residents: number; bedState: BedState; income: number;
}
export interface RoomInput { hostelId: string; roomNo: string; floor?: number | null; beds: number; monthlyFee?: number; notes?: string | null }
export interface RoomPatch { roomNo?: string; floor?: number | null; beds?: number; monthlyFee?: number; notes?: string | null; active?: boolean }
export interface RoomFilter { hostelId?: string; includeInactive: boolean }
export interface ResidentDto { student: { id: string; name: string; admissionNo: string; className: string | null }; hostel: { id: string; name: string }; room: { id: string; roomNo: string }; assignedOn: string }
export interface ResidentFilter { hostelId?: string; roomId?: string; q?: string }
export interface AllocationDto {
  hostel: { id: string; name: string; kind: HostelKindValue; wardenName: string | null; wardenPhone: string | null };
  room: { id: string; roomNo: string; floor: number | null; monthlyFee: number }; assignedOn: string;
}
export interface StudentHostel { allocation: AllocationDto | null }
export interface HostelSummary { hostels: number; rooms: number; beds: number; residents: number; freeBeds: number; monthlyIncome: number; overCapacity: number }

/** Every method receives the schoolId from the verified token (never from the request); `actorId` is the signed-in user. */
export interface HostelApi {
  summary(schoolId: string): Promise<HostelSummary>;
  listHostels(schoolId: string, includeInactive: boolean): Promise<HostelDto[]>;
  createHostel(schoolId: string, actorId: string, input: HostelInput): Promise<HostelDto>;
  updateHostel(schoolId: string, actorId: string, id: string, patch: HostelPatch): Promise<HostelDto>;
  listRooms(schoolId: string, filter: RoomFilter): Promise<RoomDto[]>;
  createRoom(schoolId: string, actorId: string, input: RoomInput): Promise<RoomDto>;
  updateRoom(schoolId: string, actorId: string, id: string, patch: RoomPatch): Promise<RoomDto>;
  listResidents(schoolId: string, filter: ResidentFilter): Promise<{ residents: ResidentDto[]; truncated: boolean }>;
  assign(schoolId: string, actorId: string, studentId: string, roomId: string): Promise<AllocationDto>;
  unassign(schoolId: string, actorId: string, studentId: string): Promise<void>;
  /** For the student page and the parent/student portal (the portal checks ownership first). */
  studentHostel(schoolId: string, studentId: string): Promise<StudentHostel>;
}

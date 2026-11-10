import type { ComplaintStatusValue } from './complaints.logic';

export type { ComplaintStatusValue };
export type ComplaintSource = 'PARENT' | 'STUDENT' | 'STAFF' | 'OTHER';
export type ComplaintCategory = 'ACADEMIC' | 'DISCIPLINE' | 'FEES' | 'TRANSPORT' | 'FACILITIES' | 'STAFF' | 'OTHER';
export type ComplaintPriority = 'LOW' | 'NORMAL' | 'HIGH';
export type NoteKind = 'NOTE' | 'STATUS' | 'ASSIGN';
export interface ComplaintDto {
  id: string; complaintNo: string; source: ComplaintSource; name: string; phone: string | null; student: { id: string; name: string; admissionNo: string } | null;
  category: ComplaintCategory; subject: string; details: string; priority: ComplaintPriority; status: ComplaintStatusValue;
  assignedTo: { id: string; name: string } | null; resolution: string | null; resolvedAt: string | null; createdAt: string;
}
export interface NoteDto { id: string; kind: NoteKind; text: string; by: string | null; createdAt: string }
export interface ComplaintDetail { complaint: ComplaintDto; notes: NoteDto[] }
export interface ComplaintInput {
  source: ComplaintSource; name: string; phone?: string | null; studentId?: string | null; category: ComplaintCategory; subject: string; details: string; priority?: ComplaintPriority;
}
export type ComplaintPatch = Partial<Omit<ComplaintInput, 'source'>>;
export interface ComplaintFilter { status?: ComplaintStatusValue; category?: ComplaintCategory; priority?: ComplaintPriority; assignedStaffId?: string; q?: string; activeOnly: boolean }
export interface ComplaintSummary { open: number; inProgress: number; highActive: number; resolved: number }

/** Every method receives the schoolId from the verified token (never from the request); `actorId` is the signed-in user. */
export interface ComplaintsApi {
  summary(schoolId: string): Promise<ComplaintSummary>;
  list(schoolId: string, filter: ComplaintFilter): Promise<{ complaints: ComplaintDto[]; truncated: boolean }>;
  get(schoolId: string, id: string): Promise<ComplaintDetail>;
  create(schoolId: string, actorId: string, input: ComplaintInput): Promise<ComplaintDetail>;
  update(schoolId: string, actorId: string, id: string, patch: ComplaintPatch): Promise<ComplaintDetail>;
  assign(schoolId: string, actorId: string, id: string, staffId: string | null): Promise<ComplaintDetail>;
  setStatus(schoolId: string, actorId: string, id: string, status: ComplaintStatusValue, resolution: string | null): Promise<ComplaintDetail>;
  addNote(schoolId: string, actorId: string, id: string, text: string): Promise<ComplaintDetail>;
}

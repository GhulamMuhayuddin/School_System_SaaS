export interface VisitDto {
  id: string; visitNo: string; name: string; phone: string | null; purpose: string; visiting: string | null;
  student: { id: string; name: string; admissionNo: string } | null; notes: string | null;
  checkInAt: string; checkOutAt: string | null; minutes: number | null; inside: boolean;
}
export interface VisitInput { name: string; phone?: string | null; purpose: string; visiting?: string | null; studentId?: string | null; notes?: string | null }
export type VisitPatch = Partial<VisitInput>;
export interface VisitFilter { date?: string; insideOnly: boolean; q?: string }
export interface VisitSummary { today: number; inside: number }

/** Every method receives the schoolId from the verified token (never from the request); `actorId` is the signed-in user. */
export interface VisitorsApi {
  summary(schoolId: string): Promise<VisitSummary>;
  list(schoolId: string, filter: VisitFilter): Promise<{ visits: VisitDto[]; truncated: boolean }>;
  checkIn(schoolId: string, actorId: string, input: VisitInput): Promise<VisitDto>;
  checkOut(schoolId: string, actorId: string, id: string): Promise<VisitDto>;
  update(schoolId: string, actorId: string, id: string, patch: VisitPatch): Promise<VisitDto>;
}

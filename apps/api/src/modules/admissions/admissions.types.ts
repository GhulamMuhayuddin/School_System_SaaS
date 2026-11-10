import type { Gender, GuardianRelation, StudentDetail } from '../students/students.types';

export type AdmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApplicationListItem {
  id: string; applicationNo: string; status: AdmissionStatus; firstName: string; lastName: string; gender: Gender;
  appliedClass: { id: string; name: string }; guardianName: string; guardianPhone: string; applicationDate: string;
}
export interface ApplicationDetail extends ApplicationListItem {
  dateOfBirth: string; bloodGroup: string | null; previousSchool: string | null; address: string | null; notes: string | null;
  guardianEmail: string | null; guardianRelation: GuardianRelation; guardianOccupation: string | null;
  decidedAt: string | null; decidedBy: { id: string; name: string } | null; decisionNote: string | null;
  student: { id: string; admissionNo: string } | null; createdAt: string;
}
export interface ApplicationInput {
  firstName: string; lastName: string; gender: Gender; dateOfBirth: string; bloodGroup?: string | null; previousSchool?: string | null;
  address?: string | null; notes?: string | null; appliedClassId: string; guardianName: string; guardianPhone: string;
  guardianEmail?: string | null; guardianRelation: GuardianRelation; guardianOccupation?: string | null; applicationDate: string;
}
export interface ApproveInput { classId?: string; sectionId?: string | null; admissionDate: string; admissionNo?: string }

export interface AdmissionsApi {
  list(schoolId: string, filter: { q?: string; status?: AdmissionStatus; classId?: string; limit: number }): Promise<{ applications: ApplicationListItem[]; total: number }>;
  get(schoolId: string, id: string): Promise<ApplicationDetail>;
  create(schoolId: string, input: ApplicationInput, actorId: string): Promise<ApplicationDetail>;
  update(schoolId: string, id: string, input: Partial<ApplicationInput>, actorId: string): Promise<ApplicationDetail>;
  approve(schoolId: string, id: string, input: ApproveInput, actorId: string): Promise<{ application: ApplicationDetail; student: StudentDetail }>;
  reject(schoolId: string, id: string, note: string | null, actorId: string): Promise<ApplicationDetail>;
}

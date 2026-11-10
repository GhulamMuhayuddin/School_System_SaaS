export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'WITHDRAWN' | 'TRANSFERRED' | 'GRADUATED';
export type GuardianRelation = 'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER';

export interface GuardianLinkDto {
  linkId: string; guardianId: string; name: string; phone: string; email: string | null; occupation: string | null;
  address: string | null; relation: GuardianRelation; isPrimary: boolean; hasAccount: boolean;
}
export interface StudentListItem {
  id: string; admissionNo: string; firstName: string; lastName: string; gender: Gender; status: StudentStatus;
  class: { id: string; name: string }; section: { id: string; name: string } | null; primaryGuardian: { name: string; phone: string } | null;
}
export interface StudentDetail extends StudentListItem {
  dateOfBirth: string; bloodGroup: string | null; phone: string | null; address: string | null; previousSchool: string | null; notes: string | null;
  admissionDate: string; leftAt: string | null; leftReason: string | null; createdAt: string; guardians: GuardianLinkDto[]; hasAccount: boolean;
  siblings: { id: string; admissionNo: string; firstName: string; lastName: string; class: string }[];
}
export interface StudentListResult { students: StudentListItem[]; total: number }

export interface GuardianInput {
  guardianId?: string; name: string; phone: string; email?: string | null; occupation?: string | null; address?: string | null;
  relation: GuardianRelation; isPrimary?: boolean;
}
export interface CreateStudentInput {
  admissionNo?: string; firstName: string; lastName: string; gender: Gender; dateOfBirth: string; bloodGroup?: string | null;
  phone?: string | null; address?: string | null; previousSchool?: string | null; notes?: string | null;
  classId: string; sectionId?: string | null; admissionDate: string; guardians: GuardianInput[];
}
export type UpdateStudentInput = Partial<Omit<CreateStudentInput, 'guardians' | 'admissionNo'>>;
export interface WithdrawInput { status: 'WITHDRAWN' | 'TRANSFERRED' | 'GRADUATED'; date: string; reason?: string | null }
export interface UpdateGuardianInput {
  name?: string; phone?: string; email?: string | null; occupation?: string | null; address?: string | null; relation?: GuardianRelation; isPrimary?: boolean;
}

export interface StudentOptions { classes: { id: string; name: string; level: number; sections: { id: string; name: string; capacity: number | null }[] }[] }

/** Used by the admissions module to enrol inside its own transaction. */
export interface StudentEnrolment {
  createInTx(tx: import('@prisma/client').Prisma.TransactionClient, schoolId: string, input: CreateStudentInput, actorId: string, auditExtra?: Record<string, string>): Promise<StudentDetail>;
}

export interface StudentsApi {
  options(schoolId: string): Promise<StudentOptions>;
  list(schoolId: string, filter: { q?: string; classId?: string; sectionId?: string; status?: StudentStatus; limit: number }): Promise<StudentListResult>;
  get(schoolId: string, id: string): Promise<StudentDetail>;
  create(schoolId: string, input: CreateStudentInput, actorId: string): Promise<StudentDetail>;
  update(schoolId: string, id: string, input: UpdateStudentInput, actorId: string): Promise<StudentDetail>;
  withdraw(schoolId: string, id: string, input: WithdrawInput, actorId: string): Promise<StudentDetail>;
  reinstate(schoolId: string, id: string, actorId: string): Promise<StudentDetail>;
  remove(schoolId: string, id: string, actorId: string): Promise<void>;
  addGuardian(schoolId: string, id: string, input: GuardianInput, actorId: string): Promise<StudentDetail>;
  updateGuardian(schoolId: string, id: string, linkId: string, input: UpdateGuardianInput, actorId: string): Promise<StudentDetail>;
  removeGuardian(schoolId: string, id: string, linkId: string, actorId: string): Promise<StudentDetail>;
}
